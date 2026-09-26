$ErrorActionPreference='Stop'
function Find-GitHubCli {
    $command=Get-Command gh -CommandType Application -ErrorAction SilentlyContinue
    if($command){return $command.Source}
    foreach($base in @($env:ProgramFiles,${env:ProgramFiles(x86)},(Join-Path $env:LOCALAPPDATA 'Programs'))){
        if($base){
            $candidate=Join-Path $base 'GitHub CLI\gh.exe'
            if(Test-Path -LiteralPath $candidate){
                $env:Path=(Split-Path -Parent $candidate)+';'+$env:Path
                return $candidate
            }
        }
    }
    return $null
}
$ghExe=Find-GitHubCli
if(-not $ghExe){
    $winget=Get-Command winget -CommandType Application -ErrorAction SilentlyContinue
    if(-not $winget){throw 'Install or update Microsoft App Installer (winget), then run setup again: https://aka.ms/getwinget'}
    Write-Output 'Installing GitHub CLI from the official WinGet package. Windows may request administrator approval.'
    & $winget.Source install --id GitHub.cli --exact --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
    if($LASTEXITCODE -ne 0){throw 'GitHub CLI installation failed. Check the installer/UAC message, then run setup again.'}
    # Installers update the persistent PATH, not this running PowerShell process.
    $env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')+';'+$env:Path
    $ghExe=Find-GitHubCli
    if(-not $ghExe){throw 'GitHub CLI was installed but gh.exe could not be located. Reopen PowerShell and run setup again.'}
}
if(-not(Get-Command git -CommandType Application -ErrorAction SilentlyContinue)){
    throw 'Install Git for Windows, reopen PowerShell and run setup again: https://gitforwindows.org/'
}
function Get-GitHubLogin {
    $savedPreference=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $login=& $ghExe api user --hostname github.com --jq .login 2>$null
        if($LASTEXITCODE -eq 0){return ([string]$login).Trim()}
        return $null
    } finally {$ErrorActionPreference=$savedPreference}
}
$login=Get-GitHubLogin
if(-not $login){
    Write-Output 'Complete the browser login using GitHub account aundots. Do not share the device code or access token.'
    & $ghExe auth login --hostname github.com --git-protocol https --web
    if($LASTEXITCODE -ne 0){throw 'GitHub login did not complete. Check the connection and run setup again.'}
    $login=Get-GitHubLogin
}
if($login -ne 'aundots'){
    throw 'The active GitHub account must be aundots. Run gh auth switch --hostname github.com --user aundots (or gh auth login), then rerun setup.'
}
& $ghExe auth setup-git --hostname github.com
if($LASTEXITCODE -ne 0){throw 'Could not configure GitHub CLI as the Git credential helper.'}
Write-Output 'GitHub CLI ready: aundots verified; Git HTTPS authentication configured.'
