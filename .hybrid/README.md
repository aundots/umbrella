# Codespaces and Windows

Use `work/hybrid` for active work. Existing main branches and original desktop folders are retained.

Codespaces: open the repository at `work/hybrid`, choose the 2-core machine, then create. The first setup installs encrypted backup tools, Codex CLI and Claude Code. Login to each AI provider once using its own account. The existing AI desktop session is not copied. Install app dependencies with `.hybrid/dependencies.sh` when needed.

Before work run `hybrid sync`. At the end run `hybrid handoff`, wait for `HANDOFF VERIFIED`, then stop the Codespace from the Codespaces menu. A divergent branch or conflicting private file is preserved and blocks sync. Resolve it explicitly. A newer automatic backup with uncommitted code can be recovered into a new folder using `hybrid recover --destination /workspaces/recovered-project`.

Windows: complete the existing restore-kit setup once. Use the standalone hybrid-kit:

```powershell
powershell -NoProfile -File hybrid.ps1 -Action recover -Project parking -Destination C:\Projects\parking
```

From the recovered project use `.hybrid/hybrid.ps1 -Action sync` before work and `-Action handoff` afterward. Recovery registers its path in the existing Windows backup timer. On a new PC install the current combined toolkit's Windows runner once with `install-windows.ps1` after the existing restore-kit setup.

Autosave in the editor saves files on the remote disk; it is not a GitHub push. Automatic encrypted snapshots and scanned GitHub code snapshots run every 5 minutes while a Codespace is running. Windows uses the existing 15-minute scheduled task. Timers cannot execute on stopped/sleeping machines. Handoff explicitly pushes the shared branch and verifies Drive before switching. No live cross-machine merge is performed.

Account settings: Codespaces $0 paid budget with Stop usage, included-usage alerts enabled, default idle timeout 10 minutes. GitHub Free's 120 core-hours are 60 active hours on a 2-core machine, shared across all projects. Storage is metered even while stopped. Do not delete a workspace with pending backups. Quota renews on the account's monthly billing cycle. No prebuilds are enabled. Use one active Codespace at a time.

The original offline recovery master key stays on Windows/offline storage. Codespaces user secrets hold separate per-project derived keys, restricted to the corresponding repository. Drive OAuth credentials are user secrets restricted to these six repositories. This credential can access the existing backup application's Drive files; do not grant these secrets to untrusted repositories or run untrusted code with them. Archives are encrypted and authenticated. Original Windows snapshots retain their original namespace/key; hybrid snapshots use `Codex-Private-Backups/hybrid` and `hybrid-history`. Keep both archive namespaces and the offline key.

Android emulator/device-dependent checks and iOS builds need the appropriate local hardware/OS. Cloud web previews must use private forwarded ports. Existing Windows absolute paths in signing/SDK configuration may need adjustment for a cloud release build. No application deployment or store release is performed by setup.
