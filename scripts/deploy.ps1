$config = Get-Content "./scripts/config.json" | ConvertFrom-Json
$srcDir = $config.srcDir
$destDir = $config.destDir
$hostname = $config.hostname
$username = $config.username

$fullyUrl = $config.fully.url;
$fullyPassword = $config.fully.password;

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
Write-Output "Copy bundled webapp to $destDir"
Copy-Item -Path $srcDir/* -Destination $destDir -Recurse -Force -ToSession $session

# Calculate statistics
$srcFiles = Get-ChildItem -Path $srcDir -Recurse
$srcFilesCount = $srcFiles.Length;
$srcSizeBytes = ($srcFiles | Measure-Object -Property Length -Sum).Sum
$srcSizeFormatted = "{0:N2} KB" -f ($srcSizeBytes / 1KB)

# Destroy session
Write-Output "WebApp deployed. #Files: $srcFilesCount / Size: $srcSizeFormatted."
Remove-PSSession $session

# Request Smart-Home Display to update
$null = Invoke-WebRequest -Uri "$fullyUrl/?cmd=clearCache&password=$fullyPassword"
$null = Invoke-WebRequest -Uri "$fullyUrl/?cmd=loadStartUrl&password=$fullyPassword"
$null = Invoke-WebRequest -Uri "$fullyUrl/?cmd=screenOn&password=$fullyPassword"
Write-Output "Fully Smart-Home display updated."
