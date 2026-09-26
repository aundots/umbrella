"""Install pinned backup binaries, verifying official release checksums."""
import argparse, hashlib, io, pathlib, tarfile, urllib.request, zipfile

def download(url):
    with urllib.request.urlopen(url,timeout=90) as response:return response.read()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--state',required=True);args=parser.parse_args()
    state=pathlib.Path(args.state)
    packages=[('rclone.exe','https://github.com/rclone/rclone/releases/download/v1.75.1/',
        'rclone-v1.75.1-linux-amd64.zip','SHA256SUMS','rclone-v1.75.1-linux-amd64/rclone'),
        ('gitleaks.exe','https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/',
        'gitleaks_8.30.1_linux_x64.tar.gz','gitleaks_8.30.1_checksums.txt','gitleaks')]
    for target,base,name,checksums,member in packages:
        path=state/target
        if path.exists():continue
        entries=download(base+checksums).decode().splitlines()
        expected=next(line.split()[0] for line in entries if line.split()[-1].lstrip('*')==name)
        raw=download(base+name)
        if hashlib.sha256(raw).hexdigest()!=expected:raise RuntimeError('Official release checksum mismatch')
        if name.endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:data=archive.read(member)
        else:
            with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:data=archive.extractfile(member).read()
        path.write_bytes(data);path.chmod(0o700)
    print('Pinned backup binaries verified.')

if __name__=='__main__':main()
