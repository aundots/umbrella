$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
if(!(Test-Path (Join-Path $statePath 'python-path.txt'))){throw 'Run restore-kit setup.ps1 first.'}
$destination=Join-Path $statePath 'hybrid-toolkit'
New-Item -ItemType Directory -Force $destination | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot '*') -Destination $destination -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run_all.py') -Destination (Join-Path $statePath 'toolkit\run_all.py') -Force
$runner=Join-Path $statePath 'toolkit\run-auto-backup.ps1'
$original=Join-Path $statePath 'toolkit\run-auto-backup.before-hybrid.ps1'
if(!(Test-Path $original)){Copy-Item -LiteralPath $runner -Destination $original}
$text=Get-Content -LiteralPath $runner -Raw
$text=$text.Replace("toolkit\auto_backup.py","toolkit\run_all.py")
[System.IO.File]::WriteAllText($runner,$text,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Hybrid backup connected to the existing Windows scheduled task.'
