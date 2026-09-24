param(
    [Parameter(Mandatory=$true)][ValidateSet('parking','orea','mute','horserace','platotracker2','umbrella')][string]$Project,
    [Parameter(Mandatory=$true)][string]$Destination,
    [string]$KeyFile,
    [switch]$NoRegister
)
$ErrorActionPreference='Stop'
if((Test-Path -LiteralPath $Destination) -and ((-not(Test-Path -LiteralPath $Destination -PathType Container)) -or (Get-ChildItem -LiteralPath $Destination -Force | Select-Object -First 1))){throw 'Choose a new or empty destination folder.'}
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
if(-not(Test-Path -LiteralPath (Join-Path $statePath 'python-path.txt'))){
    & (Join-Path $PSScriptRoot 'setup.ps1') -KeyFile $KeyFile -ProjectRoot $Destination
}
$pythonExe=(Get-Content -LiteralPath (Join-Path $statePath 'python-path.txt') -Raw).Trim()
& $pythonExe (Join-Path $PSScriptRoot 'auto_backup.py') recover-project --project $Project --destination $Destination
if($LASTEXITCODE -ne 0){throw 'Recovery did not complete. Original folders were not changed. Check login/network and use a new empty destination for retry.'}
if(-not $NoRegister){& (Join-Path $PSScriptRoot 'enable-auto-backup.ps1') -ProjectRoot $Destination}
Write-Output 'Project recovered with Git history and private files. Reinstall dependencies before building. Automatic backup is registered unless -NoRegister was specified.'
