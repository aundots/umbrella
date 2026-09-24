param([Parameter(Mandatory=$true)][ValidateSet('parking','orea','mute','horserace','platotracker2','umbrella','shared-keys')][string]$Project)
$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
$pythonExe=(Get-Content -LiteralPath (Join-Path $statePath 'python-path.txt') -Raw).Trim()
& $pythonExe (Join-Path $PSScriptRoot 'auto_backup.py') unregister --project $Project
if($LASTEXITCODE -ne 0){throw 'Could not remove local backup registration.'}
