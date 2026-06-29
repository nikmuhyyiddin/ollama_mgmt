#!/usr/bin/env bash
# setup.sh — one-shot installer for Ollama Management Server
# Run: bash scripts/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Ollama Management Server — Setup           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Python venv ──────────────────────────────────────────────────────────
echo "[1/6] Creating Python virtual environment..."
python3 -m venv "$ROOT/backend/.venv"
"$ROOT/backend/.venv/bin/pip" install --upgrade pip -q
"$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt" -q
echo "      ✓ Python deps installed"

# ── 2. Frontend build ───────────────────────────────────────────────────────
echo "[2/6] Building React frontend..."
cd "$ROOT/frontend"
npm install --legacy-peer-deps -q
npm run build
echo "      ✓ Frontend built → frontend/dist/"

# ── 3. .env file ────────────────────────────────────────────────────────────
echo "[3/6] Checking .env file..."
cd "$ROOT"
if [ ! -f ".env" ]; then
    cp .env.example .env
    SECRET=$(openssl rand -hex 32)
    sed -i "s/change-me-generate-with-openssl-rand-hex-32/$SECRET/" .env
    echo "      ✓ Created .env with generated JWT_SECRET"
else
    echo "      ✓ .env already exists — skipping"
fi

# ── 4. nginx config ─────────────────────────────────────────────────────────
echo "[4/6] Installing nginx config..."
sudo cp "$ROOT/nginx/ollama-mgmt.conf" /etc/nginx/sites-available/ollama-mgmt
sudo ln -sf /etc/nginx/sites-available/ollama-mgmt /etc/nginx/sites-enabled/ollama-mgmt
sudo nginx -t
sudo systemctl reload nginx
echo "      ✓ nginx configured"

# ── 5. systemd service ──────────────────────────────────────────────────────
echo "[5/6] Installing systemd service..."
sudo cp "$ROOT/systemd/ollama-mgmt.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ollama-mgmt
sudo systemctl restart ollama-mgmt
sleep 3
echo "      ✓ Service started"

# ── 6. Smoke test ───────────────────────────────────────────────────────────
echo "[6/6] Running smoke test..."
if curl -sf http://localhost:8000/api/gpu/stats > /dev/null; then
    echo "      ✓ Backend responding"
else
    echo "      ✗ Backend not responding — check: journalctl -u ollama-mgmt -n 30"
fi

HOST_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "══════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  App URL:   http://${HOST_IP}/"
echo "  API docs:  http://localhost:8000/docs"
echo ""
echo "  Login: user 'admin'. Password = ADMIN_PASSWORD from .env, or if unset, a"
echo "  random one printed in the logs:  journalctl -u ollama-mgmt | grep 'generated password'"
echo "  ⚠  CHANGE THE PASSWORD AFTER FIRST LOGIN"
echo "══════════════════════════════════════════════════"
