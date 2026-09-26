param([Parameter(Mandatory=$true)][ValidateSet('parking','orea','mute','horserace','platotracker2','umbrella')][string]$Project)
$ErrorActionPreference='Stop'
$spaces=gh codespace list --json name,repository,state,machineName | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'GitHub login requires codespace scope: gh auth refresh -s codespace'}
$active=@($spaces | Where-Object { $_.state -eq 'Available' -and $_.repository.name -ne $Project })
if($active.Count){throw 'Finish and stop the other active Codespace first to preserve free hours.'}
$matches=@($spaces | Where-Object { $_.repository.fullName -eq "aundots/$Project" -or $_.repository.full_name -eq "aundots/$Project" })
if($matches.Count -gt 1){throw 'Multiple Codespaces found; select one at https://github.com/codespaces'}
if($matches.Count -eq 1){
  if($matches[0].machineName -ne 'basicLinux32gb'){throw 'Existing Codespace is not the verified 2-core machine; select 2 cores on GitHub first.'}
  gh codespace code --web --codespace $matches[0].name
}else{
  $name=gh codespace create --repo "aundots/$Project" --branch work/hybrid --machine basicLinux32gb --idle-timeout 10m --display-name "$Project hybrid" --default-permissions
  if($LASTEXITCODE -ne 0){throw 'Codespace creation failed. Check included usage and the $0 budget.'}
  gh codespace code --web --codespace $name.Trim()
}
if($LASTEXITCODE -ne 0){throw 'Could not open Codespace'}
