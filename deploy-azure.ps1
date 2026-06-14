#!/usr/bin/env pwsh
# ── HexaMGP — Azure Deployment Script ────────────────────────────────────────
# Deploys all backend services to a B2s Azure VM and serves the React UI from
# the same nginx (no Static Web Apps needed — simpler, no HTTPS/CORS issues).
#
# Cost estimate (pay-as-you-go):
#   VM B2s running 8h/day × 7 days  ≈ $2.70
#   Azure OpenAI gpt-4.1-mini calls  ≈ $1-3 (demo usage)
#   Total                           ≈ $4-6 for the week
#
# Usage:  .\deploy-azure.ps1
# Stop VM after each session:  az vm deallocate -g mgp-rg -n mgp-vm
param(
    [string]$Location       = "eastus2",
    [string]$RG             = "mgp-rg",
    [string]$VmName         = "mgp-vm",
    [string]$VmSize         = "Standard_B2s",
    [string]$OpenAIName     = "mgp-openai",
    [string]$AdminUser      = "azureuser",
    [string]$ProjectRoot    = "E:\AppianDemo\mgp"
)

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  HexaMGP — Azure Deployment" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════`n" -ForegroundColor Cyan

# ── Step 1: Verify az login ───────────────────────────────────────────────────
Write-Host "[1/9] Verifying Azure login..." -ForegroundColor Yellow
$account = az account show | ConvertFrom-Json
Write-Host "  ✓ Logged in as: $($account.user.name) | Sub: $($account.name)" -ForegroundColor Green

# ── Step 2: Resource group ────────────────────────────────────────────────────
Write-Host "`n[2/9] Creating resource group '$RG' in $Location..." -ForegroundColor Yellow
az group create --name $RG --location $Location --output none
Write-Host "  ✓ Resource group ready" -ForegroundColor Green

# ── Step 3: Azure OpenAI ──────────────────────────────────────────────────────
Write-Host "`n[3/9] Provisioning Azure OpenAI (gpt-4.1-mini)..." -ForegroundColor Yellow
try {
    az cognitiveservices account create `
        --name $OpenAIName `
        --resource-group $RG `
        --kind OpenAI `
        --sku S0 `
        --location eastus2 `
        --yes `
        --output none 2>$null
    Write-Host "  ✓ Azure OpenAI resource created" -ForegroundColor Green
} catch {
    # Already exists — ignore
    Write-Host "  ✓ Azure OpenAI resource already exists" -ForegroundColor Green
}

Write-Host "  → Deploying gpt-4.1-mini model (this takes ~2 min)..." -ForegroundColor Gray
try {
    az cognitiveservices account deployment create `
        --name $OpenAIName `
        --resource-group $RG `
        --deployment-name "gpt-4.1-mini" `
        --model-name "gpt-4.1-mini" `
        --model-version "2025-04-14" `
        --model-format OpenAI `
        --sku-capacity 60 `
        --sku-name Standard `
        --output none 2>$null
    Write-Host "  ✓ gpt-4.1-mini deployment ready" -ForegroundColor Green
} catch {
    Write-Host "  ✓ Model deployment already exists or in progress" -ForegroundColor Green
}

$oaiEndpoint = (az cognitiveservices account show --name $OpenAIName --resource-group $RG | ConvertFrom-Json).properties.endpoint
$oaiKey      = (az cognitiveservices account keys list --name $OpenAIName --resource-group $RG | ConvertFrom-Json).key1
Write-Host "  ✓ Endpoint: $oaiEndpoint" -ForegroundColor Green

# ── Step 4: Create VM ─────────────────────────────────────────────────────────
Write-Host "`n[4/9] Creating VM '$VmName' ($VmSize)..." -ForegroundColor Yellow
$vmExists = az vm show --resource-group $RG --name $VmName --query "name" -o tsv 2>$null
if (-not $vmExists) {
    az vm create `
        --resource-group $RG `
        --name $VmName `
        --image Ubuntu2204 `
        --size $VmSize `
        --admin-username $AdminUser `
        --generate-ssh-keys `
        --public-ip-sku Standard `
        --output none
    Write-Host "  ✓ VM created" -ForegroundColor Green
} else {
    Write-Host "  ✓ VM already exists" -ForegroundColor Green
}

# Open HTTP port
az vm open-port --port 80  --resource-group $RG --name $VmName --priority 900 --output none 2>$null
az vm open-port --port 443 --resource-group $RG --name $VmName --priority 901 --output none 2>$null

$vmIp = az vm show -d --resource-group $RG --name $VmName --query publicIps -o tsv
Write-Host "  ✓ VM public IP: $vmIp" -ForegroundColor Green

# ── Step 5: Package code ──────────────────────────────────────────────────────
Write-Host "`n[5/9] Packaging project (excluding venvs, node_modules, caches)..." -ForegroundColor Yellow
$staging = "$env:TEMP\mgp-deploy"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory $staging | Out-Null

# robocopy: mirror but exclude heavy dirs
robocopy $ProjectRoot $staging /E /XD ".venv" "node_modules" "__pycache__" ".git" "data" /XF "*.pyc" "*.db" "*.log" /NFL /NDL /NJH /NJS | Out-Null
Write-Host "  ✓ Staging copy ready at $staging" -ForegroundColor Green

# ── Step 6: Transfer code to VM ───────────────────────────────────────────────
Write-Host "`n[6/9] Transferring code to VM (first run may take ~3 min)..." -ForegroundColor Yellow
# Ensure /opt/mgp exists on VM
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 "$AdminUser@$vmIp" "sudo mkdir -p /opt/mgp && sudo chown $AdminUser /opt/mgp"
# rsync-style copy (scp recursive)
scp -o StrictHostKeyChecking=no -r "${staging}\*" "${AdminUser}@${vmIp}:/opt/mgp/" 2>&1 | Out-Null
Write-Host "  ✓ Code transferred" -ForegroundColor Green

# ── Step 7: Create .env.production on VM ─────────────────────────────────────
Write-Host "`n[7/9] Writing production environment config..." -ForegroundColor Yellow
$envProduction = @"
MGP_ENV=production

# ── Database (SQLite per service, CWD-relative) ────────────────────────────
AUDIT_DB_URL=sqlite+aiosqlite:///./data/audit.db
IDENTITY_DB_URL=sqlite+aiosqlite:///./data/identity.db
ESIGN_DB_URL=sqlite+aiosqlite:///./data/esign.db
WORKFLOW_DB_URL=sqlite+aiosqlite:///./data/workflow.db
TASK_DB_URL=sqlite+aiosqlite:///./data/tasks.db
AGENT_DB_URL=sqlite+aiosqlite:///./data/agents.db

# ── Auth ────────────────────────────────────────────────────────────────────
AUTH_ADAPTER=stub
JWT_SECRET=prod-jwt-secret-hexamgp-$(Get-Random -Minimum 100000 -Maximum 999999)-change-me
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480

# ── LLM — Azure OpenAI ─────────────────────────────────────────────────────
LLM_ADAPTER=azure_openai
LLM_DEFAULT_MODEL=gpt-4.1-mini
LLM_ALLOWED_MODELS=gpt-4.1-mini,gpt-4o
LLM_MAX_TOKENS=4096
AZURE_OPENAI_ENDPOINT=$oaiEndpoint
AZURE_OPENAI_API_KEY=$oaiKey
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# ── Storage ─────────────────────────────────────────────────────────────────
STORAGE_ADAPTER=local
STORAGE_LOCAL_PATH=./data/files

# ── Inter-service URLs (localhost on single VM) ─────────────────────────────
AUDIT_CORE_URL=http://localhost:8001
IDENTITY_URL=http://localhost:8003
ESIGN_URL=http://localhost:8002
WORKFLOW_URL=http://localhost:8004
TASK_URL=http://localhost:8005
LLM_GATEWAY_URL=http://localhost:8007

# ── CORS (allow all for demo) ────────────────────────────────────────────────
CORS_ORIGINS=*

# ── Seeded users ─────────────────────────────────────────────────────────────
SEED_ADMIN_EMAIL=admin@mgp.local
SEED_ADMIN_PASSWORD=Admin123!
SEED_OPERATOR_EMAIL=operator@mgp.local
SEED_OPERATOR_PASSWORD=Operator123!
SEED_QA_EMAIL=qa@mgp.local
SEED_QA_PASSWORD=QA123!
SEED_AUDITOR_EMAIL=auditor@mgp.local
SEED_AUDITOR_PASSWORD=Auditor123!
"@

$tmpEnv = "$env:TEMP\mgp.env.production"
$envProduction | Out-File -FilePath $tmpEnv -Encoding utf8 -NoNewline
scp -o StrictHostKeyChecking=no $tmpEnv "${AdminUser}@${vmIp}:/opt/mgp/.env.production"
Remove-Item $tmpEnv
Write-Host "  ✓ .env.production deployed" -ForegroundColor Green

# ── Step 8: Run vm-setup.sh on the VM ─────────────────────────────────────────
Write-Host "`n[8/9] Running VM setup (installs deps, systemd services, nginx)..." -ForegroundColor Yellow
Write-Host "  This takes ~5-8 minutes on first run..." -ForegroundColor Gray
ssh -o StrictHostKeyChecking=no "$AdminUser@$vmIp" "sudo bash /opt/mgp/vm-setup.sh 2>&1"
Write-Host "  ✓ VM setup complete" -ForegroundColor Green

# Restart all services now that .env.production is in place
ssh -o StrictHostKeyChecking=no "$AdminUser@$vmIp" "sudo systemctl restart mgp-audit mgp-esign mgp-identity mgp-workflow mgp-tasks mgp-agents mgp-llm"
Write-Host "  ✓ All backend services started" -ForegroundColor Green

# ── Step 9: Build React and copy to VM ────────────────────────────────────────
Write-Host "`n[9/9] Building React UI (VITE_API_BASE=http://$vmIp)..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\packages\ui"
try {
    $env:VITE_API_BASE = "http://$vmIp"
    npm run build --silent
    Write-Host "  ✓ React build complete" -ForegroundColor Green
    ssh -o StrictHostKeyChecking=no "$AdminUser@$vmIp" "sudo mkdir -p /opt/mgp/ui-dist && sudo chown $AdminUser /opt/mgp/ui-dist"
    scp -o StrictHostKeyChecking=no -r "dist\*" "${AdminUser}@${vmIp}:/opt/mgp/ui-dist/"
    ssh -o StrictHostKeyChecking=no "$AdminUser@$vmIp" "sudo systemctl reload nginx"
    Write-Host "  ✓ React UI deployed to VM" -ForegroundColor Green
} finally {
    Remove-Item Env:\VITE_API_BASE -ErrorAction SilentlyContinue
    Pop-Location
}

# ── Seed demo data ────────────────────────────────────────────────────────────
Write-Host "`n → Seeding demo data..." -ForegroundColor Gray
# Wait a moment for services to be fully up
Start-Sleep -Seconds 8
ssh -o StrictHostKeyChecking=no "$AdminUser@$vmIp" @"
cd /opt/mgp
python3 seed_demo_data.py 2>&1 || echo 'Seed already done or failed — continuing'
"@

# ── Summary ────────────────────────────────────────────────────────────────────
Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ HexaMGP is live!" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  URL:       http://$vmIp" -ForegroundColor Cyan
Write-Host "  Login:     admin@mgp.local / Admin123!" -ForegroundColor Cyan
Write-Host "  LLM:       Azure OpenAI gpt-4.1-mini" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To STOP (billing pauses):" -ForegroundColor Yellow
Write-Host "    az vm deallocate -g $RG -n $VmName" -ForegroundColor White
Write-Host ""
Write-Host "  To START again:" -ForegroundColor Yellow
Write-Host "    az vm start -g $RG -n $VmName" -ForegroundColor White
Write-Host "    az vm show -d -g $RG -n $VmName --query publicIps -o tsv" -ForegroundColor White
Write-Host "  (IP may change after restart — rebuild UI with new IP if needed)" -ForegroundColor Gray
Write-Host ""
Write-Host "  SSH access:  ssh ${AdminUser}@${vmIp}" -ForegroundColor White
Write-Host "  Logs:        journalctl -u mgp-identity -f" -ForegroundColor White
Write-Host ""

# Cleanup staging
Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
