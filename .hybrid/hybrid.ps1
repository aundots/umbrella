param([ValidateSet('backup','handoff','sync','restore-private','recover','status','register')][string]$Action='status',[string]$Project,[string]$Destination,[string]$ProjectRoot)
$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
$pythonExe=(Get-Content -LiteralPath (Join-Path $statePath 'python-path.txt') -Raw).Trim()
$arguments=@((Join-Path $PSScriptRoot 'hybrid.py'),$Action)
if($Project){$arguments+=@('--project',$Project)}
if($Destination){$arguments+=@('--destination',$Destination)}
if($ProjectRoot){$arguments+=@('--root',$ProjectRoot)}
& $pythonExe @arguments
exit $LASTEXITCODE
