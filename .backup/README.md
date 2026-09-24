# Private project backup recovery

This toolkit restores the private files captured on 2026-09-24. It does not schedule future backups. Code is stored separately in each GitHub repository's `backup/local-2026-09-24/snapshot` branch.

## On the configured Windows computer

From a project containing `.backup/recipe.json`, run:

```powershell
powershell -NoProfile -File .backup/restore.ps1
```

The script downloads the pinned encrypted archive from the private Google Drive, validates its SHA-256 checksum, decrypts it using the Windows-protected recovery key, verifies every file, and restores missing files only. Existing files are preserved even when their contents differ. It never runs restored files or applies settings itself. Google authentication may occasionally need renewal. A Codex sandbox may require approval for access to the protected local runtime or network.

## On a new Windows computer

1. Install Python 3.10 or later from https://www.python.org/.
2. Clone the project's `backup/local-2026-09-24/snapshot` branch.
3. Copy your separately saved `RECOVERY-KEY-KEEP-PRIVATE.json` from offline storage or a password manager. Never paste its contents into chat.
4. Run `powershell -NoProfile -File .backup/setup.ps1 -KeyFile C:\private\RECOVERY-KEY-KEEP-PRIVATE.json`.
5. Complete Google login in the browser using the original private backup account. Setup checks the account identity, imports the recovery key into Windows DPAPI, and encrypts the local OAuth configuration.
6. Run the restore command above. Reinstall application dependencies separately.

The setup pins rclone v1.75.1 and validates the official archive's SHA-256. It installs cryptography 50.0.1 into a dedicated Python virtual environment. rclone uses Google Drive's `drive.file` OAuth scope. If Google retires rclone's shared OAuth client, configure your own Google OAuth client following https://rclone.org/drive/; do not disable authentication or share the backup publicly.

## Standalone toolkit and shared signing-key copies

This folder has per-project recipes instead of a single `recipe.json`. For example:

```powershell
powershell -NoProfile -File restore.ps1 -Recipe recipes\shared-keys.json -Destination C:\RestoredSigningKeys
```

Use `-VerifyOnly` to validate a backup without writing restored files. Python's `restore.py` also accepts `--archive` for a manually downloaded encrypted `.psb` file and `--key-file` for an offline key, so recovery does not depend on rclone remaining available.

## Key storage and scope

The encrypted archives do not contain the recovery key. Keep the recovery key in a password manager or offline USB separate from the Drive backup. Losing both the local protected key and the offline recovery key makes the archives unrecoverable.

The Windows-local runtime lives in `%USERPROFILE%\Documents\Codex\SecretBackup` (override with `PROJECT_SECRET_BACKUP_HOME`). It contains the encrypted Google OAuth config, DPAPI-protected keys, and encrypted download cache. Keep this directory when removing original project folders. The recovered files themselves are plaintext and must remain excluded from Git.

The snapshot covers selected local settings, signing keys, certificates, local data, and files excluded from the earlier code snapshot. It excludes reinstallable dependencies, build outputs and caches. It is not an export of live remote databases or a backup of the entire PC. Existing zero-byte database placeholders were retained as zero-byte files.

Backup encryption uses AES-256-GCM with a fresh 96-bit nonce per archive and the project name as authenticated context. The encrypted ZIP contains the file manifest and per-file SHA-256 hashes. Restore rejects corrupt data, the wrong project/key, unsafe paths and symlinks/junctions; it never overwrites existing files.
