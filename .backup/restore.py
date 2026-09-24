"""Restore authenticated project backups. Secrets are never printed."""
import argparse, base64, ctypes, hashlib, io, json, os, pathlib, shutil
import subprocess, sys, tempfile, zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b'PROJECT-SECRET-BACKUP-v1\n'
STATE = pathlib.Path(os.environ.get('PROJECT_SECRET_BACKUP_HOME', str(pathlib.Path.home()/'Documents/Codex/SecretBackup')))

def dpapi(data, decrypt=False):
    if os.name != 'nt':
        raise RuntimeError('Use --key-file on non-Windows systems')
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buf = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    result = Blob()
    lib = ctypes.WinDLL('crypt32', use_last_error=True)
    fn = lib.CryptUnprotectData if decrypt else lib.CryptProtectData
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    fn.restype = wintypes.BOOL
    if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree(result.data)

def recovery_key(path=None):
    if path:
        data = json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
        key = base64.b64decode(data['key_base64'], validate=True)
    else:
        p = STATE/'recovery-key.dpapi'
        if not p.exists():
            raise RuntimeError('Recovery key unavailable. Run setup.ps1 with your separately saved recovery key file.')
        key = dpapi(p.read_bytes(), True)
    if len(key) != 32:
        raise RuntimeError('Invalid recovery key')
    return key

def rclone(args):
    exe = STATE/'rclone.exe'
    command = str(exe) if exe.exists() else shutil.which('rclone')
    if not command:
        raise RuntimeError('rclone is not installed. See README.md.')
    env = os.environ.copy()
    password = STATE/'config-password.dpapi'
    if password.exists():
        env['RCLONE_CONFIG_PASS'] = dpapi(password.read_bytes(), True).decode()
    result = subprocess.run([command, '--config', str(STATE/'rclone.conf'), *args], capture_output=True, env=env)
    if result.returncode:
        # Never include captured output: it can contain credential material.
        raise RuntimeError('Google Drive access failed. Reconnect the configured account using setup.ps1.')
    return result.stdout

def safe_path(root, name):
    rel = pathlib.PurePosixPath(name)
    if not name or rel.is_absolute() or any(p in ('..', '.', '.git') or ':' in p or '\\' in p for p in rel.parts):
        raise RuntimeError('Unsafe archive path')
    target = root.joinpath(*rel.parts)
    if not target.resolve().is_relative_to(root.resolve()):
        raise RuntimeError('Archive path escapes destination')
    current = root
    for part in rel.parts:
        current = current/part
        if current.is_symlink() or (hasattr(current, 'is_junction') and current.is_junction()):
            raise RuntimeError('Refusing to restore through a symlink/junction')
    return target

def decode_archive(data, key, project):
    if not data.startswith(MAGIC):
        raise RuntimeError('Invalid backup format')
    nonce = data[len(MAGIC):len(MAGIC)+12]
    clear = AESGCM(key).decrypt(nonce, data[len(MAGIC)+12:], MAGIC+project.encode())
    archive = zipfile.ZipFile(io.BytesIO(clear))
    manifest = json.loads(archive.read('manifest.json'))
    if manifest['project'] != project:
        raise RuntimeError('Wrong project backup')
    names = archive.namelist()
    expected = ['manifest.json'] + ['files/'+f['path'] for f in manifest['files']]
    if len(names) != len(set(names)) or set(names) != set(expected):
        raise RuntimeError('Unexpected archive entries')
    for item in manifest['files']:
        content = archive.read('files/'+item['path'])
        if hashlib.sha256(content).hexdigest() != item['sha256']:
            raise RuntimeError('File integrity verification failed')
    return archive, manifest

def restore(recipe, root, key_path=None, archive_path=None, verify_only=False):
    key = recovery_key(key_path)
    if archive_path:
        source = pathlib.Path(archive_path)
    else:
        cache = STATE/'cache'
        cache.mkdir(parents=True, exist_ok=True)
        source = cache/(recipe['sha256']+'.psb')
        if not source.exists() or hashlib.sha256(source.read_bytes()).hexdigest() != recipe['sha256']:
            temp = cache/(recipe['sha256']+'.download')
            rclone(['copyto', recipe['remote_path'], str(temp)])
            if hashlib.sha256(temp.read_bytes()).hexdigest() != recipe['sha256']:
                temp.unlink()
                raise RuntimeError('Downloaded backup checksum mismatch')
            os.replace(temp, source)
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != recipe['sha256']:
        raise RuntimeError('Backup checksum mismatch')
    archive, manifest = decode_archive(data, key, recipe['project'])
    root = pathlib.Path(root).resolve()
    targets = [(item, safe_path(root, item['path'])) for item in manifest['files']]
    if verify_only:
        return {'project':recipe['project'], 'verified_files':len(targets)}
    # Validate every destination before creating anything. Never overwrite existing files.
    restored = existing = different = 0
    for item, target in targets:
        if target.exists():
            if not target.is_file():
                raise RuntimeError('Destination is not a regular file')
            existing += 1
            different += hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']
            continue
        # Do not restore SQLite databases beside existing WAL/SHM files.
        if item.get('sqlite') and (pathlib.Path(str(target)+'-wal').exists() or pathlib.Path(str(target)+'-shm').exists()):
            raise RuntimeError('Database sidecar exists; restore to a fresh directory instead')
        target.parent.mkdir(parents=True, exist_ok=True)
        safe_path(root, item['path'])
        content = archive.read('files/'+item['path'])
        # Prepare the complete file first, then publish without replacing an existing path.
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.restore-', delete=False) as stream:
                temporary = pathlib.Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, 0o600)
            os.link(temporary, target)
        except FileExistsError:
            existing += 1
            continue
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        restored += 1
    return {'project':recipe['project'], 'restored_files':restored, 'existing_files_preserved':existing, 'existing_files_differing':different}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--recipe', required=True)
    p.add_argument('--destination', default='.')
    p.add_argument('--key-file')
    p.add_argument('--archive')
    p.add_argument('--verify-only', action='store_true')
    args = p.parse_args()
    recipe = json.loads(pathlib.Path(args.recipe).read_text(encoding='utf-8'))
    try:
        print(json.dumps(restore(recipe, args.destination, args.key_file, args.archive, args.verify_only)))
    except Exception as error:
        print('Restore failed: '+str(error), file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
