<#
.SYNOPSIS
  Stop all MGP services started by start-local.ps1
#>

$Root    = $PSScriptRoot
$PidFile = "$Root\.local-pids.json"

if (-not (Test-Path $PidFile)) {
    Write-Host "No .local-pids.json found — nothing to stop." -ForegroundColor Yellow
    exit 0
}

$PidMap = Get-Content $PidFile | ConvertFrom-Json

$stopped = 0
$failed  = 0

Write-Host ""
Write-Host "Stopping MGP services..." -ForegroundColor Cyan

foreach ($prop in $PidMap.PSObject.Properties) {
    $name = $prop.Name
    $pid  = [int]$prop.Value
    try {
        $p = Get-Process -Id $pid -ErrorAction Stop
        $p.Kill()
        $p.WaitForExit(5000) | Out-Null
        Write-Host ("  Stopped  {0,-22} (PID {1})" -f $name, $pid) -ForegroundColor Green
        $stopped++
    } catch [System.ArgumentException] {
        Write-Host ("  Already stopped: {0,-22} (PID {1})" -f $name, $pid) -ForegroundColor Gray
    } catch {
        Write-Host ("  Failed to stop {0,-22} (PID {1}): {2}" -f $name, $pid, $_.Exception.Message) -ForegroundColor Red
        $failed++
    }
}

# Also kill any orphaned uvicorn workers (reload spawns children)
try {
    $venvPy = "$Root\.venv\Scripts\python.exe" | Resolve-Path -ErrorAction SilentlyContinue
    if ($venvPy) {
        $uvicorns = Get-Process -Name "python" -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $_.Path.StartsWith("$Root\.venv") }
        foreach ($p in $uvicorns) {
            $p.Kill()
            $stopped++
        }
    }
} catch { }

# Remove pid file
Remove-Item $PidFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Stopped $stopped process(es)." -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  $failed process(es) could not be stopped. Check Task Manager." -ForegroundColor Yellow
}
Write-Host ""
