

<!-- BEGIN private-backup-recovery -->
## Private file recovery
At the start of project work, run `powershell -NoProfile -File .backup/restore.ps1` to restore missing private configuration from the pinned encrypted backup. This preserves existing files. If setup, authentication, or the recovery key is unavailable, report it and continue only work that does not require those files; do not invent secrets. See `.backup/README.md` for one-time setup. Never print secrets, commit restored private files, or upload the recovery key. This snapshot does not include later changes or live remote databases.
<!-- END private-backup-recovery -->
