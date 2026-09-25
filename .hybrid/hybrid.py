"""Windows/Codespaces handoff with encrypted Drive snapshots. Never log credentials."""
import argparse, base64, contextlib, hashlib, hmac, json, os, pathlib
import shutil, subprocess, sys, time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE/'lib'))
import restore, auto_backup as backup, git_history

NATIVE = pathlib.Path(os.environ.get('PROJECT_SECRET_BACKUP_HOME', str(pathlib.Path.home()/'Documents/Codex/SecretBackup')))
BRANCH = 'work/hybrid'
original_key = restore.recovery_key
original_private_path = backup.private_path

def derive(master, project):
    return hmac.new(master, b'codespaces-hybrid-v1\0'+project.encode(), 'sha256').digest()

def configure(project):
    if project not in backup.PROJECTS-{'shared-keys'}:
        raise RuntimeError('Unknown project')
    if os.name == 'nt':
        state = NATIVE/'hybrid'/project
        key = derive(restore.dpapi((NATIVE/'recovery-key.dpapi').read_bytes(),True), project)
    else:
        state = pathlib.Path('/workspaces/.project-backup')/project
        key = base64.b64decode(os.environ['HYBRID_KEY_'+project.upper()], validate=True)
    if len(key) != 32: raise RuntimeError('Invalid project key')
    state.mkdir(parents=True, exist_ok=True)
    if os.name != 'nt': os.chmod(state, 0o700)
    restore.STATE = backup.STATE = state
    restore.recovery_key = lambda path=None: key
    backup.REMOTE = 'project-secrets:Codex-Private-Backups/hybrid'
    backup.locked = locked
    restore.rclone = rclone
    # Use only the authenticated user's repository and portable Git options.
    backup.git = git
    backup.private_path = lambda rel: False if rel=='.cursor/rules/hybrid-backup.mdc' else original_private_path(rel)
    if os.name == 'nt':
        for name in ['gitleaks.exe']:
            if not (state/name).exists(): shutil.copy2(NATIVE/name, state/name)
    else:
        conf = base64.b64decode(os.environ['HYBRID_DRIVE_CONFIG'], validate=True)
        if not (state/'rclone.conf').exists():
            (state/'rclone.conf').write_bytes(conf)
            os.chmod(state/'rclone.conf', 0o600)
    return state

def rclone(args):
    state = restore.STATE
    env = os.environ.copy()
    if os.name == 'nt':
        exe, conf = NATIVE/'rclone.exe', NATIVE/'rclone.conf'
        env['RCLONE_CONFIG_PASS'] = restore.dpapi((NATIVE/'config-password.dpapi').read_bytes(), True).decode()
    else:
        exe, conf = state/'rclone.exe', state/'rclone.conf'
        env['RCLONE_CONFIG_PASS'] = os.environ['HYBRID_DRIVE_PASSWORD']
    result = subprocess.run([str(exe), '--config', str(conf), '--contimeout', '20s', '--timeout', '60s',
        '--tpslimit', '2', '--tpslimit-burst', '1', *args], env=env, capture_output=True,
        timeout=1800 if args and args[0]=='copyto' else 300)
    if result.returncode: raise RuntimeError('Drive operation failed; credential values withheld')
    return result.stdout

def git(root, *args, env=None, check=True):
    child = os.environ.copy()
    child.update({'GIT_TERMINAL_PROMPT':'0', 'GCM_INTERACTIVE':'Never'})
    if env: child.update(env)
    command=['git','-c','core.hooksPath='+os.devnull,'-c','credential.interactive=false',
             '-c','core.autocrlf=false','-c','commit.gpgsign=false']
    if root: command += ['-C', str(root)]
    result=subprocess.run(command+list(args),env=child,capture_output=True,timeout=300)
    if check and result.returncode: raise RuntimeError('Git operation failed; inspect Git status separately')
    return result

@contextlib.contextmanager
def locked():
    f=(restore.STATE/'automatic.lock').open('a+b')
    if f.seek(0,2)==0: f.write(b'0');f.flush()
    f.seek(0)
    try:
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:
        f.close();raise backup.AlreadyRunning('Backup already running')
    try: yield
    finally: f.close()

def register(project,root):
    backup.register(project,root)
    if os.name=='nt':
        registry=NATIVE/'hybrid-projects.json'
        entries=backup.read_json(registry,{})
        entries[project]={'root':str(root), 'tool':str(HERE/'hybrid.py')}
        backup.write_json(registry,entries)

def snapshot(project,root):
    register(project,root)
    result=backup.run(project)
    if result: raise RuntimeError('Backup incomplete; do not delete or switch away from this workspace')

def private_restore(project,root):
    """Apply only private files; preserve conflicts and record previous restored hashes."""
    record=backup.latest(project)
    cache=restore.STATE/'cache';cache.mkdir(exist_ok=True)
    archive_path=cache/(record['sha256']+'.psb')
    if not archive_path.exists(): rclone(['copyto',record['remote_path'],str(archive_path)])
    if backup.digest(archive_path.read_bytes())!=record['sha256']:raise RuntimeError('Snapshot checksum mismatch')
    archive,manifest=restore.decode_archive(archive_path.read_bytes(),restore.recovery_key(),project)
    baseline_path=restore.STATE/'private-baseline.json'
    baseline=backup.read_json(baseline_path,{})
    conflicts=[];restored=0
    for item in manifest['files']:
        if not item['private'] or item['path'].startswith(git_history.PREFIX):continue
        name=item['path'];target=restore.safe_path(root,name)
        if item.get('sqlite') and any(pathlib.Path(str(target)+suffix).exists() for suffix in ['-wal','-shm']):
            conflicts.append(name);continue
        if target.exists():
            current=backup.digest(target.read_bytes())
            if current==item['sha256']:
                baseline[name]=current;continue
            if current!=baseline.get(name):
                conflicts.append(name);continue
        target.parent.mkdir(parents=True,exist_ok=True)
        # Atomic replacement only for an absent or unchanged previously restored file.
        temp=target.with_name(target.name+'.hybrid-restore-temp')
        if temp.exists():raise RuntimeError('Recovery temporary file already exists')
        with temp.open('xb') as stream: stream.write(archive.read('files/'+name))
        os.chmod(temp,0o600);os.replace(temp,target)
        baseline[name]=item['sha256'];restored+=1
    backup.write_json(baseline_path,baseline)
    exclude=root/'.git/info/exclude';exclude.parent.mkdir(exist_ok=True)
    text=exclude.read_text(encoding='utf-8') if exclude.exists() else ''
    lines=['/'+x['path'].replace('[','\\[').replace(']','\\]') for x in manifest['files'] if x['private'] and not x['path'].startswith(git_history.PREFIX)]
    exclude.write_text(text+'\n'+ '\n'.join(x for x in lines if x not in text.splitlines())+'\n',encoding='utf-8')
    print(json.dumps({'private_restored':restored,'private_conflicts':len(conflicts)}))
    if conflicts:raise RuntimeError('Private files have conflicting local edits; preserved existing files')
    return record,manifest

def sync(project,root):
    if git(root,'branch','--show-current').stdout.decode().strip()!=BRANCH:
        raise RuntimeError('Switch explicitly to work/hybrid before synchronizing')
    if git(root,'status','--porcelain').stdout.strip():
        raise RuntimeError('Local changes exist: handoff or back up before syncing')
    git(root,'fetch','origin',BRANCH)
    git(root,'merge','--ff-only','FETCH_HEAD')
    record,manifest=private_restore(project,root)
    # Never silently disregard newer uncommitted code in automatic snapshots.
    differing=0
    expected=set()
    for item in manifest['files']:
        if item['private']:continue
        expected.add(item['path'])
        target=restore.safe_path(root,item['path'])
        if not target.exists() or backup.digest(target.read_bytes())!=item['sha256']:differing+=1
    tracked=set(git(root,'ls-files','-z').stdout.decode().strip('\0').split('\0'))
    differing+=len({name for name in tracked if name and not backup.private_path(name)}-expected)
    if differing:
        raise RuntimeError('Automatic backup contains different code; recover it to a new folder before editing')
    print('Code and private files are ready.')

def handoff(project,root):
    if git(root,'branch','--show-current').stdout.decode().strip()!=BRANCH:
        raise RuntimeError('Handoff requires work/hybrid; other branches are never overwritten')
    old=git(root,'rev-parse','HEAD').stdout.decode().strip()
    git(root,'fetch','origin',BRANCH)
    remote=git(root,'rev-parse','FETCH_HEAD').stdout.decode().strip()
    if git(root,'merge-base','--is-ancestor',remote,old,check=False).returncode:
        raise RuntimeError('Another computer pushed newer work; back up and resolve the divergence')
    data,items,head,fingerprint=backup.capture(root,project)
    sha,scan=backup.code_commit(project,data,items,backup.device())
    if scan!='ready':raise RuntimeError('Secret scan blocked handoff')
    bare=restore.STATE/'git-snapshots'/(project+'.git')
    git(root,'fetch',str(bare),sha)
    tree=git(root,'rev-parse','FETCH_HEAD^{tree}').stdout.decode().strip()
    oldtree=git(root,'rev-parse',old+'^{tree}').stdout.decode().strip()
    commit=old
    if tree!=oldtree:
        commit=git(root,'commit-tree',tree,'-p',old,'-m','Save work for Codespaces / Windows handoff',env={
            'GIT_AUTHOR_NAME':'aundots','GIT_AUTHOR_EMAIL':'aundots@users.noreply.github.com',
            'GIT_COMMITTER_NAME':'aundots','GIT_COMMITTER_EMAIL':'aundots@users.noreply.github.com'}).stdout.decode().strip()
    # Ensure edits did not change while scanning, before publishing a reviewed tree.
    if backup.capture(root,project)[3]!=fingerprint:raise RuntimeError('Workspace changed during handoff; retry')
    git(root,'push','origin',commit+':refs/heads/'+BRANCH)
    if commit!=old:
        git(root,'update-ref','refs/heads/'+BRANCH,commit,old)
        git(root,'read-tree',commit)
    snapshot(project,root)
    print('HANDOFF VERIFIED: GitHub code and encrypted Drive files saved. You may stop this Codespace.')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['backup','handoff','sync','restore-private','recover','status','daemon','register'])
    parser.add_argument('--project')
    parser.add_argument('--root',default=str(HERE.parent))
    parser.add_argument('--destination')
    args=parser.parse_args()
    project=args.project or json.loads((HERE/'project.json').read_text())['project']
    state=configure(project);root=pathlib.Path(args.root).resolve()
    if args.action=='status':
        print(json.dumps(backup.read_json(state/'status.json',{})));return
    if args.action=='daemon':
        if os.name=='nt':raise RuntimeError('Windows uses the existing scheduled task')
        import fcntl
        daemon=(state/'daemon.lock').open('w')
        try:fcntl.flock(daemon,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:return
        while True:
            try:
                with locked():snapshot(project,root)
            except backup.AlreadyRunning:pass
            except Exception as error:
                backup.write_json(state/'daemon-status.json',{'ok':False,'error_type':type(error).__name__,'time':backup.now()})
            time.sleep(300)
    with locked():
        if args.action=='backup':snapshot(project,root)
        elif args.action=='handoff':handoff(project,root)
        elif args.action=='sync':sync(project,root)
        elif args.action=='restore-private':private_restore(project,root)
        elif args.action=='register':register(project,root)
        elif args.action=='recover':
            if not args.destination:raise RuntimeError('--destination required')
            destination=pathlib.Path(args.destination).resolve()
            if destination.exists() and any(destination.iterdir()):raise RuntimeError('Recovery requires an empty folder')
            record=backup.latest(project)
            result=backup.restore_snapshot(record,destination)
            result.update(git_history.restore_repository(backup,project,destination,record))
            git(destination,'config','core.autocrlf','false')
            # GitHub supplies reviewed toolkit; reconstructed history is preserved.
            register(project,destination)
            print(json.dumps(result))

if __name__=='__main__':
    try:main()
    except backup.AlreadyRunning:
        print('Backup already running. Wait and retry handoff/sync.');sys.exit(2)
    except Exception as error:
        print('Hybrid operation failed: '+str(error) if isinstance(error,RuntimeError) else 'Hybrid operation failed ('+type(error).__name__+'). No credential values logged.',file=sys.stderr)
        sys.exit(1)
