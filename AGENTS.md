

<!-- BEGIN hybrid-workflow -->
## Codespaces / Windows handoff (all project work)
Use the `work/hybrid` branch for switching computers. Before editing, run `hybrid sync` in Codespaces, or `powershell -NoProfile -File .hybrid/hybrid.ps1 -Action sync` on configured Windows. This only fast-forwards clean code and preserves private-file conflicts. If newer automatic backup contains uncommitted work, recover to a NEW folder; never overwrite local work.
After work, run `hybrid handoff` (Windows: `powershell -NoProfile -File .hybrid/hybrid.ps1 -Action handoff`). It scans code, pushes the shared branch, and verifies encrypted Drive backup. Do not stop/delete the workspace until HANDOFF VERIFIED is printed. Automatic snapshots run every 5 minutes while Codespaces is active and every 15 minutes on registered Windows computers.
Never print credentials, commit private files, upload the offline recovery master key, force-push, or auto-resolve divergence. Do not restore old Windows-only `.backup` instructions on this branch. Read `.hybrid/README.md`. Use 2 cores, stop when finished, respect included-usage alerts and the zero-dollar Codespaces budget. AI subscriptions are separate.
<!-- END hybrid-workflow -->
