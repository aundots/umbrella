"""Versioned multi-PC backup. Working trees and normal Git branches are never changed."""
import argparse, contextlib, datetime as dt, hashlib, hmac, io, json, os, pathlib
import re, shutil, sqlite3, subprocess, sys, tempfile, time, uuid, zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import restore

STATE=restore.STATE
REMOTE='project-secrets:Codex-Private-Backups/automatic'
PROJECTS={'parking','orea','mute','horserace','platotracker2','umbrella','shared-keys'}
SKIP={'.git','node_modules','.next','.gradle','.turbo','.dart_tool','.cxx','build','dist','out','.expo','coverage','__pycache__','caches','worktrees','ephemeral'}
GENERATED={'.apk','.aab','.ait','.class','.jar','.dex','.so','.tsbuildinfo','.log','.iml'}

def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def digest(data):return hashlib.sha256(data).hexdigest()
def read_json(path, default):return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default
def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,path)
def canonical(data):return json.dumps(data,sort_keys=True,separators=(',',':')).encode()
def sign(record,key):return {**record,'hmac':hmac.new(key,b'backup-index-v1\0'+canonical(record),'sha256').hexdigest()}
def validate(record,key,project):
    body=dict(record);signature=body.pop('hmac','')
    expected=hmac.new(key,b'backup-index-v1\0'+canonical(body),'sha256').hexdigest()
    if not hmac.compare_digest(signature,expected) or body.get('project')!=project:raise RuntimeError('Invalid signed backup index')
    prefix=REMOTE+'/'+project+'/'
    if not body.get('remote_path','').startswith(prefix) or '..' in body['remote_path']:raise RuntimeError('Invalid backup location')
    return body

@contextlib.contextmanager
def locked():
    import msvcrt
    STATE.mkdir(parents=True,exist_ok=True)
    f=(STATE/'automatic.lock').open('a+b')
    f.seek(0);f.write(b'0');f.flush();f.seek(0)
    try:msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
    except OSError:
        f.close();raise RuntimeError('Another backup is already running')
    try:yield
    finally:
        f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1);f.close()

def device():
    p=STATE/'device.json';d=read_json(p,{})
    if not d:
        d={'id':uuid.uuid4().hex[:12]};write_json(p,d)
    if not re.fullmatch('[a-f0-9]{12}',d['id']):raise RuntimeError('Invalid device identifier')
    return d['id']

def git(root,*args,env=None,check=True):
    command=['git','-c','core.hooksPath=NUL','-c','credential.interactive=false','-c','core.autocrlf=true']
    if root:command+=['-C',str(root)]
    child=os.environ.copy();child['GIT_TERMINAL_PROMPT']='0';child['GCM_INTERACTIVE']='Never'
    if env:child.update(env)
    r=subprocess.run(command+list(args),capture_output=True,env=child,timeout=180)
    if check and r.returncode:raise RuntimeError('Git operation failed')
    return r

def private_path(rel):
    p=pathlib.PurePosixPath(rel);name=p.name.lower()
    return (name.startswith('.env') or any(x in p.parts for x in ('.claude','.codex','.cursor','.idea','.vercel','release-keys','keystore'))
        or p.suffix.lower() in {'.jks','.keystore','.pem','.crt','.p12','.pfx','.key','.db','.sqlite','.zip','.psb','.dpapi'}
        or name in {'auth','auth-wal','key.properties','keystore.properties','keystore.env','signing-keys.txt','rclone.conf','local.properties'}
        or 'recovery-key' in name or 'mtls' in rel.lower() and p.suffix.lower() not in {'.ts','.js','.md'})

def candidates(root):
    for directory,dirs,names in os.walk(root):
        dirs[:]=sorted(d for d in dirs if d not in SKIP and not (pathlib.Path(directory)/d).is_symlink() and not (hasattr(pathlib.Path(directory)/d,'is_junction') and (pathlib.Path(directory)/d).is_junction()))
        for name in sorted(names):
            path=pathlib.Path(directory)/name;rel=path.relative_to(root).as_posix()
            if '/.vercel/output/' in '/'+rel:continue
            if path.suffix.lower() in GENERATED and not private_path(rel):continue
            if path.is_symlink():raise RuntimeError('Symlink file needs explicit backup policy')
            if name.endswith(('-wal','-shm')) and pathlib.Path(str(path)[:-4]).exists():continue
            if name in {'.flutter-plugins','.flutter-plugins-dependencies','GeneratedPluginRegistrant.java','next-env.d.ts','.DS_Store','Thumbs.db'}:continue
            if '/android/app/src/main/assets/' in '/'+rel:continue
            yield path,rel

def capture(root,project):
    root=pathlib.Path(root).resolve()
    if not root.is_dir():raise RuntimeError('Project directory is missing')
    allowed=set();head=None
    if project!='shared-keys':
        head=git(root,'rev-parse','HEAD').stdout.decode().strip()
        allowed=set(git(root,'ls-files','--cached','--others','--exclude-standard','-z').stdout.decode().strip('\0').split('\0'))
    data={};items=[];stats=[];total=0
    for path,rel in candidates(root):
        restore.safe_path(root,rel)
        before=path.stat();raw=path.read_bytes();after=path.stat()
        if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):raise RuntimeError('Files changed during capture; retry next run')
        total+=len(raw)
        if len(raw)>200_000_000 or total>1_000_000_000:raise RuntimeError('Snapshot size requires explicit large-file configuration')
        is_db=raw.startswith(b'SQLite format 3\x00')
        if is_db:
            started=time.monotonic()
            def progress(*args):
                if time.monotonic()-started>20:raise RuntimeError('Database snapshot timeout')
            with contextlib.closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as src,contextlib.closing(sqlite3.connect(':memory:')) as dst:
                src.backup(dst,pages=256,progress=progress)
                if dst.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('Database integrity failure')
                # SQLite backup incorporates committed WAL pages. Make the standalone
                # serialized image rollback-journal mode, as required by deserialize.
                image=bytearray(dst.serialize());image[18]=image[19]=1;raw=bytes(image)
        data[rel]=raw
        items.append({'path':rel,'size':len(raw),'sha256':digest(raw),'sqlite':is_db,'private':rel not in allowed or private_path(rel)})
        if not is_db:stats.append((path,after.st_size,after.st_mtime_ns))
    for path,size,mtime in stats:
        st=path.stat()
        if (size,mtime)!=(st.st_size,st.st_mtime_ns):raise RuntimeError('Files changed during capture; retry next run')
    if not items:raise RuntimeError('Refusing an empty project snapshot')
    if head and git(root,'rev-parse','HEAD').stdout.decode().strip()!=head:raise RuntimeError('Git HEAD changed during capture')
    fingerprint=digest(canonical({'head':head,'files':[{k:x[k] for k in ('path','sha256','private')} for x in items]}))
    return data,items,head,fingerprint

def code_commit(project,data,items,device_id):
    if project=='shared-keys':return None,'not-applicable'
    scanner=STATE/'gitleaks.exe'
    if not scanner.exists():return None,'scanner-unavailable'
    stage_parent=STATE/'staging';stage_parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=stage_parent) as temp:
        stage=pathlib.Path(temp).resolve()
        if not stage.is_relative_to(stage_parent.resolve()):raise RuntimeError('Invalid staging directory')
        for item in items:
            if item['private']:continue
            target=restore.safe_path(stage,item['path']);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data[item['path']])
        policy=STATE/'gitleaks-policy.toml'
        policy.write_text('[extend]\nuseDefault = true\n',encoding='utf-8')
        ignore=STATE/'gitleaks-empty.ignore';ignore.write_text('',encoding='utf-8')
        scan=subprocess.run([str(scanner),'dir',str(stage),'--config',str(policy),'--gitleaks-ignore-path',str(ignore),'--ignore-gitleaks-allow','--redact','--no-banner'],capture_output=True,timeout=120)
        if scan.returncode:return None,'secret-scan-blocked'
        bare=STATE/'git-snapshots'/(project+'.git');bare.parent.mkdir(exist_ok=True)
        if not bare.exists():git(None,'init','--bare',str(bare))
        args=['--git-dir='+str(bare),'--work-tree='+str(stage)]
        git(stage,*args,'add','--all','--force','--','.')
        tree=git(None,*args,'write-tree').stdout.decode().strip()
        ref='refs/heads/backup/auto/'+device_id
        old=git(None,'--git-dir='+str(bare),'rev-parse','--verify',ref,check=False)
        parent=old.stdout.decode().strip() if old.returncode==0 else None
        if parent and git(None,'--git-dir='+str(bare),'rev-parse',parent+'^{tree}').stdout.decode().strip()==tree:return parent,'ready'
        commit=['--git-dir='+str(bare),'commit-tree',tree,'-m','Automatic local backup '+now()]
        if parent:commit+=['-p',parent]
        env={'GIT_AUTHOR_NAME':'Local Backup','GIT_AUTHOR_EMAIL':'backup@localhost','GIT_COMMITTER_NAME':'Local Backup','GIT_COMMITTER_EMAIL':'backup@localhost'}
        sha=git(None,*commit,env=env).stdout.decode().strip()
        git(None,'--git-dir='+str(bare),'update-ref',ref,sha)
        return sha,'ready'

def enqueue(project,root,key,device_id,previous):
    data,items,head,fingerprint=capture(root,project)
    if previous.get('fingerprint')==fingerprint:return previous,False
    try:code_sha,code_state=code_commit(project,data,items,device_id)
    except Exception:code_sha,code_state=None,'code-capture-failed'
    created=now();name=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+fingerprint[:12]
    manifest={'format':1,'project':project,'created':created,'device':device_id,'source_head':head,'fingerprint':fingerprint,'code_sha':code_sha,'files':items}
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for item in items:z.writestr('files/'+item['path'],data[item['path']])
        z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False))
    nonce=os.urandom(12);raw=restore.MAGIC+nonce+AESGCM(key).encrypt(nonce,buffer.getvalue(),restore.MAGIC+project.encode())
    restore.decode_archive(raw,key,project)
    queue=STATE/'queue'/project;queue.mkdir(parents=True,exist_ok=True)
    archive=queue/(name+'.psb');archive.write_bytes(raw)
    record={'format':2,'project':project,'created':created,'device':device_id,'fingerprint':fingerprint,'sha256':digest(raw),'encrypted_bytes':len(raw),'file_count':len(items),'code_sha':code_sha,'code_state':code_state,'code_branch':'backup/auto/'+device_id,'remote_path':REMOTE+'/'+project+'/'+device_id+'/'+name+'.psb'}
    write_json(queue/(name+'.json'),record)
    return {'fingerprint':fingerprint,'captured':created,'code_sha':code_sha,'code_state':code_state},True

def publish_code(project,device_id):
    if project=='shared-keys':return 'not-applicable'
    bare=STATE/'git-snapshots'/(project+'.git')
    if not bare.exists():return 'no-safe-code-snapshot'
    ref='refs/heads/backup/auto/'+device_id
    sha=git(None,'--git-dir='+str(bare),'rev-parse',ref).stdout.decode().strip()
    url='https://github.com/aundots/'+project+'.git'
    # Only this PC's backup ref is ever pushed. Never force or touch normal branches.
    git(None,'--git-dir='+str(bare),'push',url,ref+':'+ref)
    remote=git(None,'ls-remote','--heads',url,ref).stdout.decode().split()
    if not remote or remote[0]!=sha:raise RuntimeError('GitHub readback mismatch')
    return 'verified'

def flush(project,key,github_state):
    queue=STATE/'queue'/project;uploaded=0
    if not queue.exists():return 0
    for file in sorted(queue.glob('*.json')):
        record=read_json(file,{})
        archive=file.with_suffix('.psb');raw=archive.read_bytes()
        if digest(raw)!=record['sha256']:raise RuntimeError('Local queued archive changed')
        restore.rclone(['copyto',str(archive),record['remote_path'],'--immutable','--retries','1'])
        check=restore.rclone(['md5sum',record['remote_path']]).decode().split()
        if not check or check[0].lower()!=hashlib.md5(raw).hexdigest():raise RuntimeError('Drive readback checksum mismatch')
        index=file.with_suffix('.signed')
        if index.exists():
            signed=read_json(index,{})
            validate(signed,key,project)
        else:
            record['github_state']=github_state
            signed=sign(record,key)
            write_json(index,signed)
        restore.rclone(['copyto',str(index),record['remote_path'][:-4]+'.json','--immutable','--retries','1'])
        # Read back the authenticated index before marking a snapshot as uploaded.
        downloaded=json.loads(restore.rclone(['cat',record['remote_path'][:-4]+'.json']))
        validate(downloaded,key,project)
        if downloaded!=signed:raise RuntimeError('Drive index readback mismatch')
        cache=STATE/'cache';cache.mkdir(exist_ok=True)
        target=cache/(record['sha256']+'.psb')
        if not archive.resolve().is_relative_to((STATE/'queue').resolve()) or not target.resolve().is_relative_to(cache.resolve()):raise RuntimeError('Invalid queue path')
        os.replace(archive,target);file.unlink();index.unlink();uploaded+=1
    return uploaded

def register(project,root):
    if project not in PROJECTS:raise RuntimeError('Unknown project')
    root=pathlib.Path(root).resolve()
    if not root.is_dir():raise RuntimeError('Project directory not found')
    if project!='shared-keys':
        url=git(root,'remote','get-url','origin').stdout.decode().strip()
        if url not in {'https://github.com/aundots/'+project+'.git','https://github.com/aundots/'+project,'git@github.com:aundots/'+project+'.git'}:raise RuntimeError('Unexpected Git remote')
    projects=read_json(STATE/'projects.json',{})
    projects[project]={'root':str(root)};write_json(STATE/'projects.json',projects)

def run(selected=None):
    results={};key=restore.recovery_key();device_id=device()
    projects=read_json(STATE/'projects.json',{})
    state=read_json(STATE/'automatic-state.json',{})
    for project,entry in projects.items():
        if selected and project!=selected:continue
        result={'time':now()}
        try:
            state[project],changed=enqueue(project,entry['root'],key,device_id,state.get(project,{}))
            write_json(STATE/'automatic-state.json',state)
            result['local']='captured' if changed else 'unchanged';result['code_scan']=state[project]['code_state']
        except Exception as error:result['local']='failed';result['error_type']=type(error).__name__
        try:result['github']=publish_code(project,device_id)
        except Exception:result['github']='failed'
        try:result['uploaded_snapshots']=flush(project,key,result['github']);result['drive']='verified'
        except Exception:result['drive']='failed'
        result['pending']=len(list((STATE/'queue'/project).glob('*.json')))
        result['ok']=result.get('local')!='failed' and result['drive']=='verified' and result['pending']==0 and (project=='shared-keys' or (result['github']=='verified' and result.get('code_scan')=='ready'))
        results[project]=result
        write_json(STATE/'status.json',{'device':device_id,'last_run':now(),'projects':results,'complete':False})
        print(json.dumps({'project':project,**result}),flush=True)
    write_json(STATE/'status.json',{'device':device_id,'last_run':now(),'projects':results,'complete':True})
    return 0 if results and all(x['ok'] for x in results.values()) else 1

def latest(project):
    key=restore.recovery_key()
    listing=json.loads(restore.rclone(['lsjson',REMOTE+'/'+project,'--recursive','--files-only','--include','*.json']))
    records=[]
    for entry in listing:
        path=entry['Path']
        if '..' in path or '\\' in path:raise RuntimeError('Invalid index name')
        body=validate(json.loads(restore.rclone(['cat',REMOTE+'/'+project+'/'+path])),key,project)
        records.append(body)
    if not records:raise RuntimeError('No automatic snapshot exists yet')
    return max(records,key=lambda x:x['created'])

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    r=sub.add_parser('register');r.add_argument('--project',required=True,choices=sorted(PROJECTS));r.add_argument('--root',required=True)
    r=sub.add_parser('run');r.add_argument('--project',choices=sorted(PROJECTS))
    sub.add_parser('status')
    r=sub.add_parser('latest');r.add_argument('--project',required=True,choices=sorted(PROJECTS))
    r=sub.add_parser('restore-latest');r.add_argument('--project',required=True,choices=sorted(PROJECTS));r.add_argument('--destination',required=True)
    args=p.parse_args()
    if args.command=='status':print(json.dumps(read_json(STATE/'status.json',{})));return 0
    if args.command=='latest':print(json.dumps(latest(args.project)));return 0
    with locked():
        if args.command=='register':register(args.project,args.root);print('Project registered on this computer.');return 0
        if args.command=='run':return run(args.project)
        if args.command=='restore-latest':
            recipe=latest(args.project)
            print(json.dumps(restore.restore(recipe,args.destination)))
            return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        print('Backup operation failed ('+type(error).__name__+'). Inspect status.json or rerun after checking login/network.',file=sys.stderr)
        raise SystemExit(1)
