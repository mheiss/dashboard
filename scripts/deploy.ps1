$srcDir    = "./dist/Dashboard/browser"
$destDir   = "/srv/dashboard"
$hostname  = "dashboard.heiss.lan"
$username  = "root"

# Create a session to the remote server
Write-Output "Connecting to remote server $hostname"
$session = New-PSSession -Hostname $hostname -Username $username

# Verify target directory
$exists = Invoke-Command -Session $session -ScriptBlock {
    param($destDir)
    Test-Path $destDir
} -ArgumentList $destDir

if (-not $exists) {
    Write-Error "Remote directory '$destDir' does not exist on $hostname. Aborting deployment."
    Remove-PSSession $session
    return
}

# Remove contents of the remote directory, but keep the directory itself
Invoke-Command -Session $session -ScriptBlock {
    param($destDir)
    Get-ChildItem -Path $destDir -Recurse -Force | Remove-Item -Recurse -Force
} -ArgumentList $destDir

#  Copy the local directory to the remote server
Write-Output "Copy bundled webapp $srcDir -> $destDir"
Copy-Item -Path $srcDir/* -Destination $destDir -Recurse -Force -ToSession $session

# Destroy session
Write-Output "Successfully deployed"
Remove-PSSession $session
