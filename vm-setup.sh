#!/usr/bin/env bash
# ── HexaMGP VM Setup ─────────────────────────────────────────────────────────
# Run once on a fresh Ubuntu 22.04 VM after code is uploaded to /opt/mgp
# Usage: sudo bash /opt/mgp/vm-setup.sh
set -euo pipefail

MGPROOT=/opt/mgp
SERVICES=(audit-core esign identity workflow-engine task-service agent-service llm-gateway)
PORTS=(8001 8002 8003 8004 8005 8006 8007)
SVCNAMES=(mgp-audit mgp-esign mgp-identity mgp-workflow mgp-tasks mgp-agents mgp-llm)

echo "=== [1/7] Installing system packages ==="
apt-get update -qq
apt-get install -y python3.11 python3.11-venv python3-pip nodejs npm nginx curl

echo "=== [2/7] Installing shared Python library ==="
pip3 install -e "$MGPROOT/packages/py-shared" --quiet

echo "=== [3/7] Setting up per-service Python venvs ==="
for svc in "${SERVICES[@]}"; do
  svcdir="$MGPROOT/services/$svc"
  echo "  → $svc"
  python3.11 -m venv "$svcdir/.venv"
  "$svcdir/.venv/bin/pip" install --quiet -e "$MGPROOT/packages/py-shared"
  "$svcdir/.venv/bin/pip" install --quiet -r "$svcdir/requirements.txt"
  mkdir -p "$svcdir/data"
done

echo "=== [4/7] Creating systemd services ==="
# Port array index matches service array
for i in "${!SERVICES[@]}"; do
  svc="${SERVICES[$i]}"
  port="${PORTS[$i]}"
  svcname="${SVCNAMES[$i]}"
  svcdir="$MGPROOT/services/$svc"
  cat > "/etc/systemd/system/${svcname}.service" <<EOF
[Unit]
Description=HexaMGP ${svc}
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${svcdir}
ExecStart=${svcdir}/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${port} --workers 1
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/mgp/.env.production
Environment=PYTHONPATH=/opt/mgp/packages/py-shared

[Install]
WantedBy=multi-user.target
EOF
done

systemctl daemon-reload
chown -R www-data:www-data "$MGPROOT"

echo "=== [5/7] Configuring nginx ==="
cat > /etc/nginx/sites-available/mgp <<'NGINXEOF'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 20M;

    # React SPA
    root /opt/mgp/ui-dist;
    index index.html;

    # API reverse proxies — strip /api/<svc>/ prefix, proxy to localhost port
    location /api/identity/ { proxy_pass http://127.0.0.1:8003/; include /etc/nginx/proxy_params; }
    location /api/workflow/  { proxy_pass http://127.0.0.1:8004/; include /etc/nginx/proxy_params; }
    location /api/tasks/     { proxy_pass http://127.0.0.1:8005/; include /etc/nginx/proxy_params; }
    location /api/audit/     { proxy_pass http://127.0.0.1:8001/; include /etc/nginx/proxy_params; }
    location /api/agents/    { proxy_pass http://127.0.0.1:8006/; include /etc/nginx/proxy_params; }
    location /api/esign/     { proxy_pass http://127.0.0.1:8002/; include /etc/nginx/proxy_params; }
    location /api/llm/       { proxy_pass http://127.0.0.1:8007/; include /etc/nginx/proxy_params; }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

# Shared proxy params
cat > /etc/nginx/proxy_params <<'PROXYEOF'
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_read_timeout 120s;
PROXYEOF

# Remove default site, enable ours
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/mgp /etc/nginx/sites-enabled/mgp
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "=== [6/7] Enabling services ==="
for svcname in "${SVCNAMES[@]}"; do
  systemctl enable "$svcname"
  systemctl start "$svcname" || true   # don't fail if .env.production not ready yet
done

echo "=== [7/7] Done ==="
echo ""
echo "Services installed. Check status with: systemctl status mgp-identity"
echo "Logs: journalctl -u mgp-identity -f"
echo ""
echo "⚠  .env.production must be at /opt/mgp/.env.production before services work."
echo "   Run: systemctl restart mgp-audit mgp-esign mgp-identity mgp-workflow mgp-tasks mgp-agents mgp-llm"
