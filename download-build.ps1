# PowerShell script to download built Solana program from GitHub Actions
# Run this after pushing to GitHub and the workflow completes

param(
    [string]$Repository = "Admin/WOLF-SPIN",
    [string]$WorkflowName = "Build Solana Program",
    [string]$OutputDir = "target/deploy"
)

Write-Host "Downloading build artifacts from GitHub Actions..." -ForegroundColor Green

# Create output directory
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force
}

# Get the latest workflow run
$workflowRuns = gh api repos/$Repository/actions/workflows/build.yml/runs --jq '.workflow_runs[0]'
$runId = $workflowRuns.id
$status = $workflowRuns.status

Write-Host "Latest workflow run ID: $runId, Status: $status" -ForegroundColor Yellow

if ($status -ne "completed") {
    Write-Host "Workflow is not completed yet. Please wait and try again." -ForegroundColor Red
    exit 1
}

# Download artifacts
Write-Host "Downloading artifacts..." -ForegroundColor Green
gh api repos/$Repository/actions/runs/$runId/artifacts --jq '.artifacts[] | select(.name == "solana-program") | .download_url' | ForEach-Object {
    $downloadUrl = $_
    $tempFile = "temp-artifact.zip"
    
    Write-Host "Downloading from: $downloadUrl" -ForegroundColor Yellow
    Invoke-WebRequest -Uri $downloadUrl -Headers @{Authorization = "token $env:GITHUB_TOKEN"} -OutFile $tempFile
    
    # Extract the zip file
    Expand-Archive -Path $tempFile -DestinationPath $OutputDir -Force
    Remove-Item $tempFile
    
    Write-Host "Build artifacts downloaded to: $OutputDir" -ForegroundColor Green
}

Write-Host "Done! You can now deploy the program using:" -ForegroundColor Green
Write-Host "  anchor deploy --program-id <your-program-id>" -ForegroundColor Cyan
