# Start all MGP services locally (no Docker)
# Usage: .\dev-local.ps1

$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$python  = "$root\.venv\Scripts\python.exe"
$uvicorn = "$root\.venv\Scripts\uvicorn.exe"

$services = @(
    @{ name="audit-core";      port=8001; dir="services\audit-core";      db="data\audit\audit.db" },
    @{ name="esign";           port=8002; dir="services\esign";           db="data\esign\esign.db" },
    @{ name="identity";        port=8003; dir="services\identity";        db="data\identity\identity.db" },
    @{ name="workflow-engine"; port=8004; dir="services\workflow-engine"; db="data\workflow\workflow.db" },
    @{ name="task-service";    port=8005; dir="services\task-service";    db="data\tasks\tasks.db" },
    @{ name="agent-service";   port=8006; dir="services\agent-service";   db="data\agents\agents.db" },
    @{ name="llm-gateway";     port=8007; dir="services\llm-gateway";     db="" }
)

# Ensure data directories exist
foreach ($d in @("audit","esign","identity","workflow","tasks","agents","files")) {
    New-Item -ItemType Directory -Force "$root\data\$d" | Out-Null
}

# Env vars injected into every service window (localhost URLs, not Docker)
$envBlock = @"
`$env:MGP_ENV              = 'local'
`$env:AUTH_ADAPTER         = 'stub'
`$env:JWT_SECRET           = 'local-dev-secret-change-in-prod-min-32-chars'
`$env:JWT_ALGORITHM        = 'HS256'
`$env:JWT_EXPIRE_MINUTES   = '480'
`$env:CORS_ORIGINS         = 'http://localhost:3000,http://localhost:5173'
`$env:AUDIT_CORE_URL       = 'http://localhost:8001'
`$env:IDENTITY_URL         = 'http://localhost:8003'
`$env:ESIGN_URL            = 'http://localhost:8002'
`$env:WORKFLOW_URL         = 'http://localhost:8004'
`$env:TASK_URL             = 'http://localhost:8005'
`$env:LLM_GATEWAY_URL      = 'http://localhost:8007'
`$env:LLM_ADAPTER          = 'ollama'
`$env:OLLAMA_BASE_URL      = 'http://localhost:11434'
`$env:LLM_DEFAULT_MODEL    = 'llama3.2'
`$env:LLM_ALLOWED_MODELS   = 'llama3.2,llama3.1,mistral'
`$env:LLM_MAX_TOKENS       = '4096'
`$env:SEED_ADMIN_EMAIL     = 'admin@mgp.local'
`$env:SEED_ADMIN_PASSWORD  = 'Admin123!'
`$env:SEED_OPERATOR_EMAIL  = 'operator@mgp.local'
`$env:SEED_OPERATOR_PASSWORD = 'Operator123!'
`$env:SEED_QA_EMAIL        = 'qa@mgp.local'
`$env:SEED_QA_PASSWORD     = 'QA123!'
`$env:SEED_AUDITOR_EMAIL   = 'auditor@mgp.local'
`$env:SEED_AUDITOR_PASSWORD = 'Auditor123!'
`$env:STORAGE_ADAPTER      = 'local'
"@

foreach ($svc in $services) {
    $svcDir = Join-Path $root $svc.dir
    $port   = $svc.port
    $name   = $svc.name
    $dbUrl  = if ($svc.db) { "sqlite+aiosqlite:///$root\$($svc.db)" } else { "" }
    $dbLine = if ($dbUrl)  { "`$env:DB_URL = '$dbUrl'" } else { "" }

    $cmd = "$envBlock`n$dbLine`nSet-Location '$svcDir'; & '$uvicorn' app.main:app --host 0.0.0.0 --port $port --log-level info"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
    Write-Host "  [+] $name  -> http://localhost:$port/docs"
}

# Start UI
$uiDir = Join-Path $root "packages\ui"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$uiDir'; npm run dev -- --port 3000" -WindowStyle Normal
Write-Host "  [+] ui  -> http://localhost:3000"

Write-Host ""
Write-Host "  MGP is running at http://localhost:3000" -ForegroundColor Green
Write-Host "  Login: admin@mgp.local / Admin123!" -ForegroundColor Yellow
Write-Host ""
