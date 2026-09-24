param([string]$KeyFile, [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
New-Item -ItemType Directory -Path $statePath -Force | Out-Null
$taskUser=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $statePath /inheritance:r /grant:r "${taskUser}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect local backup configuration directory.'}
$venvPython=Join-Path $statePath 'venv\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $venvPython)){
    if(Get-Command py -ErrorAction SilentlyContinue){ & py -3 -m venv (Join-Path $statePath 'venv') }
    elseif(Get-Command python -ErrorAction SilentlyContinue){ & python -m venv (Join-Path $statePath 'venv') }
    else { throw 'Install Python 3.10 or later from python.org, then run setup.ps1 again.' }
    if($LASTEXITCODE -ne 0){throw 'Python virtual environment creation failed.'}
}
& $venvPython -m pip install 'cryptography==50.0.1'
if($LASTEXITCODE -ne 0){throw 'Could not install the encryption library.'}
$arguments=@((Join-Path $PSScriptRoot 'setup.py'))
if($KeyFile){$arguments+=@('--key-file',$KeyFile)}
& $venvPython @arguments
if($LASTEXITCODE -ne 0){throw 'One-time setup did not complete.'}
if(Test-Path -LiteralPath (Join-Path $ProjectRoot '.backup\recipe.json')){
    & (Join-Path $PSScriptRoot 'enable-auto-backup.ps1') -ProjectRoot $ProjectRoot
}else{
    Write-Output 'Authentication is configured. Run enable-auto-backup.ps1 -ProjectRoot <project folder> for each project on this PC.'
}
