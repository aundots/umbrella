"""One-time Windows setup; Google consent is performed by the user."""
import argparse, base64, hashlib, io, json, os, pathlib, secrets, subprocess, sys, urllib.request, zipfile
import restore

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--key-file')
    p.add_argument('--print-config-password',action='store_true',help=argparse.SUPPRESS)
    args=p.parse_args()
    state=restore.STATE
    if args.print_config_password:
        # Called only as an rclone password-command pipe; do not run in a chat terminal.
        print(restore.dpapi((state/'config-password.dpapi').read_bytes(),True).decode())
        return
    state.mkdir(parents=True,exist_ok=True)
    if args.key_file:
        key=restore.recovery_key(args.key_file)
        (state/'recovery-key.dpapi').write_bytes(restore.dpapi(key))
    elif not (state/'recovery-key.dpapi').exists():
        raise RuntimeError('Provide --key-file with your offline recovery key JSON; never paste its contents.')
    secret=state/'config-password.dpapi'
    if not secret.exists():secret.write_bytes(restore.dpapi(secrets.token_urlsafe(48).encode()))
    exe=state/'rclone.exe'
    if not exe.exists():
        url='https://github.com/rclone/rclone/releases/download/v1.75.1/rclone-v1.75.1-windows-amd64.zip'
        data=urllib.request.urlopen(url).read()
        if hashlib.sha256(data).hexdigest()!='200eb602c126d82aa38b51e0f6b9ae837473ff99b51278d3f6f837574c494d6e':
            raise RuntimeError('rclone checksum mismatch')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            exe.write_bytes(archive.read('rclone-v1.75.1-windows-amd64/rclone.exe'))
    config=state/'rclone.conf'
    env=os.environ.copy()
    env['RCLONE_CONFIG_PASS']=restore.dpapi(secret.read_bytes(),True).decode()
    # Restrict new OAuth access to files created/accessed by this rclone application.
    if not config.exists():
        argv=[str(exe),'--config',str(config),'config','create','project-secrets','drive','scope','drive.file','config_is_local','true','--no-output']
        print('Choose the Google account used for your private backup and complete consent in the browser.',flush=True)
        subprocess.run(argv,check=True,env=env)
    restore.rclone(['about','project-secrets:','--json'])
    cfg=json.loads(restore.rclone(['config','dump']))
    token=json.loads(cfg['project-secrets']['token'])['access_token']
    req=urllib.request.Request('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req) as response:email=json.load(response)['user']['emailAddress']
    expected_account_hash='59f8efc76af19eb7323e040c8eedae15c553409820efdbe007489ce201fe732b'
    if hashlib.sha256(email.lower().encode()).hexdigest()!=expected_account_hash:
        raise RuntimeError('Wrong Google account; reconnect using the private backup owner account')
    helper=subprocess.list2cmdline([sys.executable,str(pathlib.Path(__file__).resolve()),'--print-config-password'])
    subprocess.run([str(exe),'--config',str(config),'config','encryption','set','--password-command',helper],env=env,check=True,capture_output=True)
    (state/'python-path.txt').write_text(sys.executable,encoding='utf-8')
    print('Google account verified; local recovery key and OAuth config are protected. Setup complete.')

if __name__=='__main__':
    try:main()
    except Exception:
        print('Setup failed. Check your Google account, recovery key file and network connection. Credential values are not logged.',file=sys.stderr)
        raise SystemExit(1)
