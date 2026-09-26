param(
    [ValidateSet('Run','Status','Latest','RestoreLatest')][string]$Action='Run',
    [string]$Destination
)
$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
$pythonExe=(Get-Content -LiteralPath (Join-Path $statePath 'python-path.txt') -Raw).Trim()
$recipe=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'recipe.json') -Raw | ConvertFrom-Json
$tool=Join-Path $PSScriptRoot 'auto_backup.py'
switch($Action){
    'Run' { & $pythonExe $tool run --project $recipe.project }
    'Status' { & $pythonExe $tool status }
    'Latest' { & $pythonExe $tool latest --project $recipe.project }
    'RestoreLatest' {
        if(-not $Destination){throw 'Specify a new destination folder for recovery.'}
        & $pythonExe $tool restore-latest --project $recipe.project --destination $Destination
    }
}
if($LASTEXITCODE -ne 0){throw 'Backup action needs attention. Existing project files were not overwritten.'}
