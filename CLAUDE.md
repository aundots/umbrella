

<!-- BEGIN hybrid-workflow -->
## Codespaces / Windows handoff (all project work)
Use the `work/hybrid` branch for switching computers. Only after explicit user approval for this operation, run `hybrid sync` in Codespaces, or `powershell -NoProfile -File .hybrid/hybrid.ps1 -Action sync` on configured Windows. This only fast-forwards clean code and preserves private-file conflicts. If newer automatic backup contains uncommitted work, recover to a NEW folder; never overwrite local work.
After work, ask for explicit user approval before running `hybrid handoff` (Windows: `powershell -NoProfile -File .hybrid/hybrid.ps1 -Action handoff`). It scans code, pushes the shared branch, and verifies encrypted Drive backup. Do not stop/delete the workspace until HANDOFF VERIFIED is printed. Automatic backup and sync are disabled. Request permission once daily in the original Codex task (10:00 Asia/Seoul), and never treat silence as consent. Ask before each backup, push/pull, restore, or software update. Do not create timers or background daemons.
Never print credentials, commit private files, upload the offline recovery master key, force-push, or auto-resolve divergence. Do not restore old Windows-only `.backup` instructions on this branch. Read `.hybrid/README.md`. Use 2 cores, stop when finished, respect included-usage alerts and the zero-dollar Codespaces budget. AI subscriptions are separate.
<!-- END hybrid-workflow -->
