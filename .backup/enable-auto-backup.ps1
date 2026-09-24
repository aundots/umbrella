param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot), [switch]$SkipRegistration)
$ErrorActionPreference='Stop'
$statePath=if($env:PROJECT_SECRET_BACKUP_HOME){$env:PROJECT_SECRET_BACKUP_HOME}else{Join-Path $env:USERPROFILE 'Documents\Codex\SecretBackup'}
$pythonExe=(Get-Content -LiteralPath (Join-Path $statePath 'python-path.txt') -Raw).Trim()
if(-not(Test-Path -LiteralPath $pythonExe)){throw 'Run setup.ps1 first.'}
$toolkit=Join-Path $statePath 'toolkit'
New-Item -ItemType Directory -Path $toolkit -Force | Out-Null
foreach($name in @('restore.py','auto_backup.py','run-auto-backup.ps1')){
    $from=Join-Path $PSScriptRoot $name
    $to=Join-Path $toolkit $name
    if([IO.Path]::GetFullPath($from) -ne [IO.Path]::GetFullPath($to)){Copy-Item -LiteralPath $from -Destination $to -Force}
}
if(-not $SkipRegistration){
    $recipe=Get-Content -LiteralPath (Join-Path $ProjectRoot '.backup\recipe.json') -Raw | ConvertFrom-Json
    & $pythonExe (Join-Path $toolkit 'auto_backup.py') register --project $recipe.project --root $ProjectRoot
    if($LASTEXITCODE -ne 0){throw 'Project registration failed.'}
}
$taskUser=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$taskName='ProjectSecretBackup-'+$sid
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $toolkit 'run-auto-backup.ps1')+'"'
$action=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $arguments
$timer=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(15) -RepetitionInterval (New-TimeSpan -Minutes 15)
$logon=New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$principal=New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($timer,$logon) -Principal $principal -Settings $settings -Description 'Back up registered projects to per-PC GitHub refs and encrypted, versioned Google Drive archives. No working-tree overwrite or normal-branch push.' -Force | Out-Null
$task=Get-ScheduledTask -TaskName $taskName
if($task.State -eq 'Disabled'){throw 'Backup task is disabled.'}
Write-Output "Automatic backup enabled: $taskName (every 15 minutes while signed in)."
