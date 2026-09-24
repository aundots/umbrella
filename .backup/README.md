# Private project backup recovery

This toolkit backs up registered Windows projects every 15 minutes while the user is signed in. It also retains the original private-file recovery snapshot from 2026-09-24. The bootstrap toolkit is stored in each GitHub repository's `backup/local-2026-09-24/snapshot` branch.

## Automatic backup across computers

Each PC has a randomly generated device ID. Source code snapshots are committed in an isolated local Git repository and pushed only to `backup/auto/<device-id>`. Working directories, their Git index/HEAD, and normal remote branches are not changed. A pinned Gitleaks scanner checks the entire selected code snapshot before publication; detected secrets block the GitHub snapshot but the encrypted Drive backup still preserves the files.

Changed source files, private configuration and local data are also stored together as AES-256-GCM encrypted archives in `Codex-Private-Backups/automatic/<project>/<device-id>/`. New versions are append-only and have authenticated index records. No changes means no new snapshot. Saved changes are captured locally before upload; offline archives remain in the protected queue and are retried at the next run. Old versions are retained; there is no automatic deletion.

Windows Task Scheduler runs the backup at sign-in and every 15 minutes while signed in, without requiring Codex or Claude Code to remain open. Sleeping or powered-off computers cannot back up until they resume. The registered task is `ProjectSecretBackup-<Windows-user-SID>`, runs as the current user without elevation, and avoids concurrent runs. Only one registered folder per project per PC is supported; registering a different folder for that project replaces its local registration. New projects must be registered explicitly.

Useful commands from a registered project:

```powershell
powershell -NoProfile -File .backup/auto-backup.ps1 -Action Run
powershell -NoProfile -File .backup/auto-backup.ps1 -Action Status
powershell -NoProfile -File .backup/auto-backup.ps1 -Action Latest
powershell -NoProfile -File .backup/auto-backup.ps1 -Action RestoreLatest -Destination C:\RecoveredProject
```

`RestoreLatest` selects the newest authenticated automatic snapshot by capture time and restores missing files only. It does not merge different computers' edits or overwrite existing files. Prefer a new empty directory for full recovery. The `Latest` result includes the exact GitHub code commit and PC backup branch. Use that branch/commit when cloning the newest code instead of assuming the bootstrap branch is current. Simultaneous edits on multiple PCs remain separate snapshots; resolve code conflicts explicitly before continuing work. Keep PC clocks accurate.

For a new PC, first inspect `Latest`, then choose the desired snapshot/branch before editing. Do not treat this backup system as live bidirectional synchronization. Codex and Claude Code instructions check for newer snapshots at the start of work and request an immediate backup at completion, in addition to the independent Windows timer.

## On the configured Windows computer

From a project containing `.backup/recipe.json`, run:

```powershell
powershell -NoProfile -File .backup/restore.ps1
```

The script downloads the pinned encrypted archive from the private Google Drive, validates its SHA-256 checksum, decrypts it using the Windows-protected recovery key, verifies every file, and restores missing files only. Existing files are preserved even when their contents differ. It never runs restored files or applies settings itself. Google authentication may occasionally need renewal. A Codex sandbox may require approval for access to the protected local runtime or network.

## On a new Windows computer

1. Install Python 3.11 or later from https://www.python.org/ and Git for Windows. Setup automatically installs GitHub CLI through WinGet when missing, verifies the `aundots` account, and configures Git HTTPS authentication. Complete browser login once if requested. WinGet (Microsoft App Installer) must be available; Windows may request administrator approval during installation.
2. Clone the project's `backup/local-2026-09-24/snapshot` branch.
3. Copy your separately saved `RECOVERY-KEY-KEEP-PRIVATE.json` from offline storage or a password manager. Never paste its contents into chat.
4. Run `powershell -NoProfile -File .backup/setup.ps1 -KeyFile C:\private\RECOVERY-KEY-KEEP-PRIVATE.json`.
5. Complete Google login in the browser using the original private backup account. Setup checks the account identity, imports the recovery key into Windows DPAPI, and encrypts the local OAuth configuration.
6. Setup registers this project and the 15-minute Windows task. For each additional project, run `powershell -NoProfile -File .backup/enable-auto-backup.ps1 -ProjectRoot C:\path\to\project`; Google login and recovery-key import only need to be done once per Windows account.
7. Check `Latest` to find the newest automatic snapshot. The simple `restore.ps1` command below remains pinned to the initial private-file snapshot. Reinstall application dependencies separately.

The setup pins rclone v1.75.1 and Gitleaks v8.30.1 and validates their official archive SHA-256 hashes. It installs cryptography 50.0.1 into a dedicated Python virtual environment. rclone uses Google Drive's `drive.file` OAuth scope. If Google retires rclone's shared OAuth client, configure your own Google OAuth client following https://rclone.org/drive/; do not disable authentication or share the backup publicly.

## Standalone toolkit and shared signing-key copies

This folder has per-project recipes instead of a single `recipe.json`. For example:

```powershell
powershell -NoProfile -File restore.ps1 -Recipe recipes\shared-keys.json -Destination C:\RestoredSigningKeys
```

Use `-VerifyOnly` to validate a backup without writing restored files. Python's `restore.py` also accepts `--archive` for a manually downloaded encrypted `.psb` file and `--key-file` for an offline key, so recovery does not depend on rclone remaining available.

## Key storage and scope

The encrypted archives do not contain the recovery key. Keep the recovery key in a password manager or offline USB separate from the Drive backup. Losing both the local protected key and the offline recovery key makes the archives unrecoverable.

The Windows-local runtime lives in `%USERPROFILE%\Documents\Codex\SecretBackup` (override with `PROJECT_SECRET_BACKUP_HOME`). It contains the encrypted Google OAuth config, DPAPI-protected keys, and encrypted download cache. Keep this directory when removing original project folders. The recovered files themselves are plaintext and must remain excluded from Git.

Automatic snapshots cover saved local source, signing keys, certificates, settings and local data. Reinstallable dependencies, build outputs, caches and directory links are excluded. Individual files above 200 MB or snapshots above 1 GB require a separate large-file policy; they fail explicitly rather than silently omitting data. SQLite databases are copied using the backup API, including committed WAL data. These snapshots are not exports of live remote databases, unsaved editor buffers, or the entire PC. The original pinned snapshot retained existing zero-byte database placeholders as zero-byte files.

Local health is recorded in `status.json` and `last-run.log` under the runtime directory. A failed or partial run is visible in Task Scheduler's last result. Pending encrypted uploads stay under `queue`; do not delete that directory while uploads are pending. To pause automatic backup, disable this user's `ProjectSecretBackup-...` task in Task Scheduler. Other PCs keep their own schedules.

Backup encryption uses AES-256-GCM with a fresh 96-bit nonce per archive and the project name as authenticated context. The encrypted ZIP contains the file manifest and per-file SHA-256 hashes. Restore rejects corrupt data, the wrong project/key, unsafe paths and symlinks/junctions; it never overwrites existing files.

GitHub-only setup: run `powershell -NoProfile -File .backup/setup-github.ps1`. Existing installations and valid logins are reused. Official installation reference: https://github.com/cli/cli/blob/trunk/docs/install_windows.md

## Complete project recovery after deleting a local folder

Use the standalone toolkit (auto-backup-kit.zip), kept outside the project you delete:

```powershell
powershell -NoProfile -File recover-project.ps1 -Project parking -Destination C:\Projects\parking -KeyFile C:\private\RECOVERY-KEY-KEEP-PRIVATE.json
```

On a new PC this first runs setup, installing GitHub CLI if missing and requesting GitHub/Google login. Git for Windows and Python remain prerequisites. On a configured PC the key argument can be omitted. The destination must be new or empty. Recovery downloads the authenticated snapshot, fetches its exact code commit from GitHub, and restores the original Git HEAD, branches, tags, stash entries, staged and unstaged saved work. It reconnects origin and registers the recovered folder for automatic backup. `-NoRegister` leaves registration unchanged for a recovery test. Install project dependencies separately.

Git bundles are encrypted separately under automatic-history and reused by content on each PC. Never delete these objects: older snapshots may reference them. Changed Git history creates a new encrypted object. Bundles include commits reachable from refs, HEAD and reflogs; unreachable objects not in any of those are not promised. Old reflog commits are preserved as refs/recovery/reflog/*; exact reflog messages/timestamps and custom Git hooks are not recreated. Merge conflicts and submodules require explicit handling and block full-history capture. Source files above 200 MB, Git bundles above 512 MB or total captures above 1 GB fail explicitly.

Before deleting a source folder, finish a successful backup and restore test and stop editing it. Then run `powershell -NoProfile -File unregister-project.ps1 -Project parking` from the standalone toolkit. This only removes that PC's schedule registration; it does not delete any source or cloud data. Do not run it early if continuing local work. Keep the toolkit, recovery key and local SecretBackup runtime outside deleted folders. The shared-keys registration can remain active.

Private files and Git history still require Google Drive and the separate recovery key; GitHub alone only recovers the scanned code snapshot. Dependencies/build artifacts, ignored generated content, live server databases and unsaved editor buffers are outside this backup. Tracked files are preserved even when their extension normally denotes a build artifact. Backup is not automatic conflict resolution between PCs.
