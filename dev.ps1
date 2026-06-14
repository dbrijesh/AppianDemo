# Windows PowerShell alternative to `make dev`
# Run with: .\dev.ps1
if (-not (Test-Path ".env.local")) { Copy-Item ".env.example" ".env.local" }
docker compose --env-file .env.local up -d
Write-Host ""
Write-Host "  MGP is running at http://localhost:3000" -ForegroundColor Green
Write-Host "  Identity:        http://localhost:8003/docs"
Write-Host "  Workflow Engine: http://localhost:8004/docs"
Write-Host "  Task Service:    http://localhost:8005/docs"
Write-Host "  Audit Core:      http://localhost:8001/docs"
Write-Host ""
