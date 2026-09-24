$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
$pythonExe=(Get-Content -LiteralPath (Join-Path $statePath 'python-path.txt') -Raw).Trim()
$tool=Join-Path $statePath 'toolkit\auto_backup.py'
& $pythonExe $tool run *> (Join-Path $statePath 'last-run.log')
exit $LASTEXITCODE
