<#
.SYNOPSIS
  Start the full MGP platform locally — no Docker required.
  Compatible with Windows PowerShell 5.1 and PowerShell 7+.

.USAGE
  cd E:\AppianDemo\mgp
  .\start-local.ps1          # first run installs deps (~2 min)
  .\stop-local.ps1           # stop everything

.REQUIRES
  Python 3.11+ on PATH ("python --version" should work)
  Node.js 18+  on PATH ("node --version" should work)
#>

$ErrorActionPreference = "Stop"
$Root   = $PSScriptRoot
$Venv   = "$Root\.venv"
$Py     = "$Venv\Scripts\python.exe"
$LogDir = "$Root\logs"

New-Item -ItemType Directory -Force -Path $LogDir        | Out-Null
New-Item -ItemType Directory -Force -Path "$Root\data"   | Out-Null
foreach ($d in @("audit","identity","esign","workflow","tasks","agents","files","docs")) {
    New-Item -ItemType Directory -Force -Path "$Root\data\$d" | Out-Null
}

# ── Shared environment values ────────────────────────────────────────────────
$SharedEnv = @"
MGP_ENV=local
JWT_SECRET=local-dev-secret-change-in-prod-min-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
AUTH_ADAPTER=stub
LLM_ADAPTER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_DEFAULT_MODEL=llama3.2
LLM_ALLOWED_MODELS=llama3.2,llama3.1,mistral
LLM_MAX_TOKENS=4096
MGP_ENV=local
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
AUDIT_CORE_URL=http://localhost:8001
IDENTITY_URL=http://localhost:8003
ESIGN_URL=http://localhost:8002
WORKFLOW_URL=http://localhost:8004
TASK_URL=http://localhost:8005
LLM_GATEWAY_URL=http://localhost:8007
SEED_ADMIN_EMAIL=admin@mgp.local
SEED_ADMIN_PASSWORD=Admin123!
SEED_OPERATOR_EMAIL=operator@mgp.local
SEED_OPERATOR_PASSWORD=Operator123!
SEED_QA_EMAIL=qa@mgp.local
SEED_QA_PASSWORD=QA123!
SEED_AUDITOR_EMAIL=auditor@mgp.local
SEED_AUDITOR_PASSWORD=Auditor123!
STORAGE_ADAPTER=local
STORAGE_LOCAL_PATH=./data/files
"@

# ── Service definitions ──────────────────────────────────────────────────────
$Services = @(
    @{ Name="audit-core";      Dir="services\audit-core";     Port=8001; DbKey="audit"    },
    @{ Name="identity";        Dir="services\identity";        Port=8003; DbKey="identity" },
    @{ Name="esign";           Dir="services\esign";           Port=8002; DbKey="esign"    },
    @{ Name="workflow-engine"; Dir="services\workflow-engine"; Port=8004; DbKey="workflow" },
    @{ Name="task-service";    Dir="services\task-service";    Port=8005; DbKey="tasks"    },
    @{ Name="llm-gateway";     Dir="services\llm-gateway";     Port=8007; DbKey="llm"      },
    @{ Name="agent-service";   Dir="services\agent-service";   Port=8006; DbKey="agents"   }
)

# ── Step 1: Write per-service .env.local files ───────────────────────────────
Write-Host ""
Write-Host "[1/5] Writing service configuration..." -ForegroundColor Cyan
$DataFwd = "$Root\data".Replace("\", "/")
foreach ($svc in $Services) {
    $svcDir  = "$Root\$($svc.Dir)"
    $dbPath  = "$DataFwd/$($svc.DbKey)/$($svc.DbKey).db"
    $envContent = $SharedEnv + "`nDB_URL=sqlite+aiosqlite:///$dbPath`n"

    # agent-service needs cross-DB access paths
    if ($svc.Name -eq "agent-service") {
        $envContent += "OWN_DB_PATH=$DataFwd/agents/agents.db`n"
        $envContent += "CROSS_DB_BASE=$DataFwd`n"
    }

    Set-Content -Path "$svcDir\.env.local" -Value $envContent -Encoding utf8
}

# ── Step 2: Create venv (prefer Python 3.12 — 3.14 lacks prebuilt wheels) ────
if (-not (Test-Path $Py)) {
    Write-Host "[2/5] Creating Python virtual environment (Python 3.12)..." -ForegroundColor Cyan
    # Try py launcher first (works on most Windows installs), then python3.12, then python
    $pyExe = $null
    foreach ($candidate in @("py -3.12", "python3.12", "python")) {
        $parts = $candidate -split " "
        $out = & $parts[0] $parts[1..$parts.Length] "--version" 2>&1
        if ($LASTEXITCODE -eq 0 -and "$out" -match "3\.(1[0-9])") { $pyExe = $parts; break }
    }
    if (-not $pyExe) { $pyExe = @("python") }
    & $pyExe[0] $pyExe[1..$pyExe.Length] -m venv "$Venv"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "venv creation failed. Make sure Python 3.10-3.12 is installed."
        exit 1
    }
}

# ── Step 3: Install Python deps ──────────────────────────────────────────────
Write-Host "[3/5] Installing Python dependencies (first run takes ~1 min)..." -ForegroundColor Cyan
& $Py -m pip install --quiet --upgrade pip 2>$null
& $Py -m pip install --quiet -r "$Root\requirements-dev.txt"
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; exit 1 }
& $Py -m pip install --quiet -e "$Root\packages\py-shared"
if ($LASTEXITCODE -ne 0) { Write-Error "pip install shared package failed"; exit 1 }

# ── Step 4: Launch backend services ─────────────────────────────────────────
Write-Host "[4/5] Starting backend services..." -ForegroundColor Cyan

$PidMap = @{}
foreach ($svc in $Services) {
    $svcDir  = "$Root\$($svc.Dir)"
    $stdout  = "$LogDir\$($svc.Name).log"
    $stderr  = "$LogDir\$($svc.Name).err"

    # Launch: python -m uvicorn app.main:app --host 0.0.0.0 --port N --reload
    $proc = Start-Process `
        -FilePath $Py `
        -ArgumentList "-m", "uvicorn", "app.main:app", `
                      "--host", "0.0.0.0", `
                      "--port", $svc.Port, `
                      "--reload" `
        -WorkingDirectory $svcDir `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError  $stderr `
        -NoNewWindow `
        -PassThru

    $PidMap[$svc.Name] = $proc.Id
    Write-Host ("  {0,-22} PID {1,6}   http://localhost:{2}/docs" -f $svc.Name, $proc.Id, $svc.Port)
}

$PidMap | ConvertTo-Json | Set-Content "$Root\.local-pids.json" -Encoding utf8

# ── Step 5: Start UI ─────────────────────────────────────────────────────────
Write-Host "[5/5] Starting UI dev server..." -ForegroundColor Cyan
$uiDir = "$Root\packages\ui"

if (-not (Test-Path "$uiDir\node_modules")) {
    Write-Host "  Running npm install (first run)..." -ForegroundColor Yellow
    Push-Location $uiDir
    npm install --silent
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
}

$uiProc = Start-Process powershell `
    -ArgumentList "-NoProfile","-NonInteractive","-Command",
                  "cd '$uiDir'; npm run dev" `
    -NoNewWindow -PassThru

$PidMap["ui"] = $uiProc.Id
$PidMap | ConvertTo-Json | Set-Content "$Root\.local-pids.json" -Encoding utf8

# ── Wait for services to boot ────────────────────────────────────────────────
Write-Host ""
Write-Host "Waiting 12 seconds for services to initialise..." -ForegroundColor Yellow
Start-Sleep -Seconds 12

# Quick health check
$healthy = 0
foreach ($svc in $Services) {
    try {
        $null = Invoke-WebRequest "http://localhost:$($svc.Port)/health" -UseBasicParsing -TimeoutSec 3
        $healthy++
    } catch { }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  MGP is running locally   ($healthy/$($Services.Count) services healthy)" -ForegroundColor Green
Write-Host ""
Write-Host "  UI (Vite dev):   http://localhost:3000" -ForegroundColor White
Write-Host "  Audit Core:      http://localhost:8001/docs"
Write-Host "  Identity:        http://localhost:8003/docs"
Write-Host "  Esign:           http://localhost:8002/docs"
Write-Host "  Workflow Engine: http://localhost:8004/docs"
Write-Host "  Task Service:    http://localhost:8005/docs"
Write-Host "  LLM Gateway:     http://localhost:8007/docs"
Write-Host "  Agent Service:   http://localhost:8006/docs"
Write-Host ""
Write-Host "  Login:  admin@mgp.local / Admin123!" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Logs:   $LogDir\"
Write-Host "  Stop:   .\stop-local.ps1"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
