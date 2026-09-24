param(
    [string]$Recipe = (Join-Path $PSScriptRoot 'recipe.json'),
    [string]$Destination = (Split-Path -Parent $PSScriptRoot),
    [string]$KeyFile,
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
$statePath = if ($env:PROJECT_SECRET_BACKUP_HOME) { $env:PROJECT_SECRET_BACKUP_HOME } else { Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup' }
$pythonRecord = Join-Path $statePath 'python-path.txt'
$pythonExe = if (Test-Path -LiteralPath $pythonRecord) { (Get-Content -LiteralPath $pythonRecord -Raw).Trim() } else { $null }
if (-not $pythonExe -or -not (Test-Path -LiteralPath $pythonExe)) {
    throw 'Run .backup/setup.ps1 once with your recovery key file before restoring on this computer.'
}
$arguments = @((Join-Path $PSScriptRoot 'restore.py'), '--recipe', $Recipe, '--destination', $Destination)
if ($KeyFile) { $arguments += @('--key-file', $KeyFile) }
if ($VerifyOnly) { $arguments += '--verify-only' }
& $pythonExe @arguments
if ($LASTEXITCODE -ne 0) { throw 'Restore did not complete. Existing files were not overwritten.' }
