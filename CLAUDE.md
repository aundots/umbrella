

<!-- BEGIN private-backup-recovery -->
## Multi-PC backup and recovery
At the start of work, run `powershell -NoProfile -File .backup/auto-backup.ps1 -Action Latest` to inspect the newest authenticated snapshot. If another PC has newer work, compare its exact code commit before editing; do not overwrite local changes or automatically merge/switch branches. Full recovery should target a new empty directory. If setup/authentication is unavailable, report it and continue only independent work; never invent secrets.
At the end of work, run `powershell -NoProfile -File .backup/auto-backup.ps1 -Action Run` to back up saved changes. A Windows timer also runs every 15 minutes after this PC's one-time setup. Backups use separate per-PC GitHub branches and encrypted Drive versions; normal branches and the working index are unchanged.
See `.backup/README.md` for setup on another Windows PC and recovery. Never print or commit secrets or the recovery key. Do not delete pending encrypted backups. Backup is not live bidirectional synchronization and excludes remote database contents and unsaved editor buffers.
<!-- END private-backup-recovery -->
