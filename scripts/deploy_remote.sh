#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# deploy_remote.sh — Deploy Ollama + Ollama Management Server to a remote host
#
# Usage:
#   bash scripts/deploy_remote.sh <REMOTE_USER>@<REMOTE_HOST> [OPTIONS]
#
# Options:
#   --domain    <FQDN>        Domain name for the server (e.g. ollama_a6000.malakoff.com.my)
#   --host-ip   <IP>          IP or hostname used internally (default: remote host)
#   --models-dir <PATH>       Remote path to store Ollama models (default: /mnt/data/ollama_models)
#   --no-ollama               Skip Ollama installation (if already installed)
#   --no-mgmt                 Skip ollama_mgmt deployment (Ollama only)
#   --no-cert                 Skip SSL certificate copy
#   --skip-build              Skip frontend npm build (use pre-built dist/)
#
# Examples:
#   bash scripts/deploy_remote.sh nms_admin@192.168.1.50 \
#       --domain ollama_a6000.malakoff.com.my \
#       --models-dir /mnt/nvme/ollama_models
#
# Requirements (local):
#   - SSH key-based auth to the remote host
#   - rsync installed locally
#   - This script run from the ollama_mgmt project root
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colour output ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
REMOTE_TARGET=""
DOMAIN=""
MODELS_DIR="/mnt/data/ollama_models"
SKIP_OLLAMA=false
SKIP_MGMT=false
SKIP_CERT=false
SKIP_BUILD=false
REMOTE_DEPLOY_DIR="/home"   # will be resolved to /home/<USER>/ollama_mgmt

# ── Argument parsing ──────────────────────────────────────────────────────────
if [ $# -lt 1 ]; then
    echo "Usage: bash scripts/deploy_remote.sh <USER>@<HOST> [--domain <FQDN>] [--models-dir <PATH>] [--no-ollama] [--no-mgmt] [--no-cert] [--skip-build]"
    exit 1
fi
REMOTE_TARGET="$1"; shift

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)      DOMAIN="$2";        shift 2 ;;
        --models-dir)  MODELS_DIR="$2";    shift 2 ;;
        --no-ollama)   SKIP_OLLAMA=true;   shift   ;;
        --no-mgmt)     SKIP_MGMT=true;     shift   ;;
        --no-cert)     SKIP_CERT=true;     shift   ;;
        --skip-build)  SKIP_BUILD=true;    shift   ;;
        *) error "Unknown option: $1" ;;
    esac
done

REMOTE_USER="${REMOTE_TARGET%%@*}"
REMOTE_HOST="${REMOTE_TARGET##*@}"
REMOTE_HOME="/home/${REMOTE_USER}"
REMOTE_APP_DIR="${REMOTE_HOME}/ollama_mgmt"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${LOCAL_ROOT}/wildcard.malakoff.com.my_2026"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Ollama + Ollama-Mgmt Remote Deployment Script      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
info "Target        : ${REMOTE_TARGET}"
info "Domain        : ${DOMAIN:-'(not set — will use _)'}"
info "Models dir    : ${MODELS_DIR}"
info "App dir       : ${REMOTE_APP_DIR}"
info "Skip Ollama   : ${SKIP_OLLAMA}"
info "Skip Mgmt     : ${SKIP_MGMT}"
info "Skip cert     : ${SKIP_CERT}"
echo ""

# ── Preflight: SSH connectivity ───────────────────────────────────────────────
step "1 / 9  Preflight checks"
info "Testing SSH connection to ${REMOTE_TARGET}..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "${REMOTE_TARGET}" "echo OK" \
    || error "Cannot SSH to ${REMOTE_TARGET}. Ensure SSH key-based auth is set up."
success "SSH OK"

# Verify remote OS
REMOTE_OS=$(ssh "${REMOTE_TARGET}" "lsb_release -is 2>/dev/null || cat /etc/os-release | grep ^ID= | cut -d= -f2")
info "Remote OS: ${REMOTE_OS}"

# ── Step 2: Install system dependencies ──────────────────────────────────────
step "2 / 9  Installing system dependencies on remote"
ssh "${REMOTE_TARGET}" bash <<'ENDSSH'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq \
    curl wget git rsync \
    python3 python3-pip python3-venv python3-dev \
    build-essential \
    nginx \
    nodejs npm \
    sqlite3 \
    openssl \
    ca-certificates \
    lsof net-tools
echo "System dependencies installed."
ENDSSH
success "System dependencies installed"

# ── Step 3: Install NVIDIA drivers + CUDA toolkit (if needed) ─────────────────
step "3 / 9  Checking NVIDIA GPU (A6000) on remote"
ssh "${REMOTE_TARGET}" bash <<'ENDSSH'
set -euo pipefail
if command -v nvidia-smi &>/dev/null; then
    echo "NVIDIA driver already present:"
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
else
    echo "WARNING: nvidia-smi not found."
    echo "Please install NVIDIA drivers for the A6000 manually before proceeding:"
    echo "  1. Add NVIDIA PPA or use the Ubuntu driver manager"
    echo "  2. Run: sudo ubuntu-drivers install nvidia:570"
    echo "  3. Reboot and re-run this script with --no-ollama if Ollama was already installed"
    echo ""
    echo "Skipping NVIDIA check — continuing with deployment..."
fi
ENDSSH

# ── Step 4: Install Ollama ────────────────────────────────────────────────────
if [ "${SKIP_OLLAMA}" = false ]; then
    step "4 / 9  Installing Ollama on remote"
    ssh "${REMOTE_TARGET}" bash <<'ENDSSH'
set -euo pipefail
if command -v ollama &>/dev/null; then
    CURRENT_VER=$(ollama --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
    echo "Ollama already installed: v${CURRENT_VER}"
    echo "Updating to latest..."
fi
curl -fsSL https://ollama.ai/install.sh | sh
echo "Ollama installed: $(ollama --version)"
ENDSSH
    success "Ollama installed"

    # Configure Ollama systemd override for A6000
    step "4b / 9  Configuring Ollama service for A6000"
    MODELS_DIR_ESCAPED="${MODELS_DIR}"
    ssh "${REMOTE_TARGET}" bash <<ENDSSH
set -euo pipefail

# Create models directory
sudo mkdir -p "${MODELS_DIR_ESCAPED}"
sudo chown ollama:ollama "${MODELS_DIR_ESCAPED}" 2>/dev/null || true

# Write override for A6000 (single GPU — higher parallelism than multi-GPU setup)
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<EOF
[Service]
Environment="OLLAMA_MODELS=${MODELS_DIR_ESCAPED}/models"
Environment="OLLAMA_HOST=127.0.0.1"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
Environment="OLLAMA_MAX_QUEUE=512"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
EOF

sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama
sleep 3
if sudo systemctl is-active --quiet ollama; then
    echo "Ollama service running OK"
else
    echo "WARNING: Ollama service failed to start — check: journalctl -u ollama -n 30"
fi
ENDSSH
    success "Ollama service configured for A6000"
else
    info "Skipping Ollama installation (--no-ollama)"
fi

# ── Step 5: Build frontend locally ───────────────────────────────────────────
if [ "${SKIP_MGMT}" = false ]; then
    step "5 / 9  Building React frontend"
    if [ "${SKIP_BUILD}" = false ]; then
        info "Running npm install + build locally..."
        cd "${LOCAL_ROOT}/frontend"
        npm install --legacy-peer-deps -q
        npm run build
        success "Frontend built → frontend/dist/"
        cd "${LOCAL_ROOT}"
    else
        info "Skipping build (--skip-build). Using existing dist/"
        [ -d "${LOCAL_ROOT}/frontend/dist" ] || error "frontend/dist/ not found. Remove --skip-build to build first."
    fi

    # ── Step 6: Sync application files to remote ─────────────────────────────
    step "6 / 9  Syncing application to ${REMOTE_TARGET}:${REMOTE_APP_DIR}"
    ssh "${REMOTE_TARGET}" "mkdir -p ${REMOTE_APP_DIR}"

    rsync -az --progress \
        --exclude='.git' \
        --exclude='.venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='node_modules' \
        --exclude='.env' \
        --exclude='db/ollama.db' \
        --exclude='.pytest_cache' \
        --exclude='wildcard.malakoff.com.my_2026' \
        "${LOCAL_ROOT}/" \
        "${REMOTE_TARGET}:${REMOTE_APP_DIR}/"
    success "Application files synced"

    # ── Step 7: Copy SSL certificates ────────────────────────────────────────
    if [ "${SKIP_CERT}" = false ]; then
        step "7 / 9  Copying SSL certificates"
        if [ -d "${CERT_DIR}" ]; then
            rsync -az "${CERT_DIR}/" \
                "${REMOTE_TARGET}:${REMOTE_APP_DIR}/wildcard.malakoff.com.my_2026/"
            success "Certificates copied to remote"
        else
            warn "Certificate directory not found at ${CERT_DIR} — skipping cert copy"
            warn "SSL will not work until you manually copy the certs."
        fi
    else
        info "Skipping cert copy (--no-cert)"
    fi

    # ── Step 8: Remote setup ──────────────────────────────────────────────────
    step "8 / 9  Running remote setup"
    DOMAIN_NAME="${DOMAIN:-_}"

    ssh "${REMOTE_TARGET}" bash <<ENDSSH
set -euo pipefail

APP_DIR="${REMOTE_APP_DIR}"
DOMAIN="${DOMAIN_NAME}"
cd "\$APP_DIR"

echo "[8a] Creating Python virtual environment..."
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip -q
backend/.venv/bin/pip install -r backend/requirements.txt -q
echo "     Python deps installed"

echo "[8b] Generating .env file..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    # Generate new JWT secret
    SECRET=\$(openssl rand -hex 32)
    sed -i "s/change-me-generate-with-openssl-rand-hex-32/\$SECRET/" .env
    # Set Ollama host to localhost
    sed -i "s|OLLAMA_HOST=.*|OLLAMA_HOST=http://127.0.0.1:11434|" .env
    # Set CORS origins
    if [ "\$DOMAIN" != "_" ]; then
        sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=*,https://\${DOMAIN}|" .env
    fi
    echo "     .env created with new JWT_SECRET"
else
    echo "     .env already exists — skipping (update manually if needed)"
fi

echo "[8c] Initialising SQLite database..."
mkdir -p db
if [ ! -f db/ollama.db ] && [ -f backend/db/schema.sql ]; then
    sqlite3 db/ollama.db < backend/db/schema.sql
    echo "     Database initialised"
else
    echo "     Database already exists or schema not found — skipping"
fi

echo "[8d] Installing Nginx config..."
# Build Nginx config with correct domain + cert paths
CERT_PATH="\${APP_DIR}/wildcard.malakoff.com.my_2026/wildcard.malakoff.com.my_2026_fullchain.crt"
KEY_PATH="\${APP_DIR}/wildcard.malakoff.com.my_2026/wildcard.malakoff.com.my_2026.key"

# Check if fullchain exists, create if not
if [ -f "\${APP_DIR}/wildcard.malakoff.com.my_2026/wildcard.malakoff.com.my_2026.crt" ] && \
   [ -f "\${APP_DIR}/wildcard.malakoff.com.my_2026/wildcard.malakoff.com.my_2026CA.crt" ]; then
    cat "\${APP_DIR}/wildcard.malakoff.com.my_2026/wildcard.malakoff.com.my_2026.crt" \
        "\${APP_DIR}/wildcard.malakoff.com.my_2026/wildcard.malakoff.com.my_2026CA.crt" \
        > "\${CERT_PATH}"
    echo "     Fullchain certificate created"
fi

# Update certificate paths in the nginx config
cp nginx/ollama-mgmt.conf /tmp/ollama-mgmt-remote.conf
sed -i "s|ssl_certificate .*|ssl_certificate     \${CERT_PATH};|" /tmp/ollama-mgmt-remote.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key \${KEY_PATH};|" /tmp/ollama-mgmt-remote.conf
sed -i "s|root .*frontend/dist;|root \${APP_DIR}/frontend/dist;|" /tmp/ollama-mgmt-remote.conf
# Set correct server_name
if [ "\$DOMAIN" != "_" ]; then
    sed -i "s|server_name .*;|server_name \${DOMAIN};|g" /tmp/ollama-mgmt-remote.conf
fi

sudo cp /tmp/ollama-mgmt-remote.conf /etc/nginx/sites-available/ollama-mgmt
sudo ln -sf /etc/nginx/sites-available/ollama-mgmt /etc/nginx/sites-enabled/ollama-mgmt
# Disable default site if present
sudo rm -f /etc/nginx/sites-enabled/default

if sudo nginx -t; then
    sudo systemctl enable nginx
    sudo systemctl reload nginx
    echo "     Nginx configured and reloaded"
else
    echo "     WARNING: nginx -t failed — check /etc/nginx/sites-available/ollama-mgmt"
fi

echo "[8e] Installing ollama-mgmt systemd service..."
# Update service file with correct working directory and user
cp systemd/ollama-mgmt.service /tmp/ollama-mgmt-remote.service
sed -i "s|User=nms_admin|User=${REMOTE_USER}|" /tmp/ollama-mgmt-remote.service
sed -i "s|Group=nms_admin|Group=${REMOTE_USER}|" /tmp/ollama-mgmt-remote.service
sed -i "s|WorkingDirectory=.*|WorkingDirectory=\${APP_DIR}|" /tmp/ollama-mgmt-remote.service
sed -i "s|EnvironmentFile=.*|EnvironmentFile=\${APP_DIR}/.env|" /tmp/ollama-mgmt-remote.service
sed -i "s|ExecStart=.*|ExecStart=\${APP_DIR}/backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1 --access-log --log-level info|" /tmp/ollama-mgmt-remote.service
sudo cp /tmp/ollama-mgmt-remote.service /etc/systemd/system/ollama-mgmt.service
sudo systemctl daemon-reload
sudo systemctl enable ollama-mgmt
sudo systemctl restart ollama-mgmt
sleep 3
if sudo systemctl is-active --quiet ollama-mgmt; then
    echo "     ollama-mgmt service running OK"
else
    echo "     WARNING: ollama-mgmt failed to start — check: journalctl -u ollama-mgmt -n 30"
fi
ENDSSH
    success "Remote setup complete"
fi

# ── Step 9: Smoke test ────────────────────────────────────────────────────────
step "9 / 9  Running smoke tests"
ssh "${REMOTE_TARGET}" bash <<'ENDSSH'
set -euo pipefail

echo -n "  Ollama API     ... "
if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAILED (check: journalctl -u ollama -n 20)"
fi

echo -n "  Management API ... "
if curl -sf http://localhost:8000/api/gpu/stats > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAILED (check: journalctl -u ollama-mgmt -n 20)"
fi

echo -n "  Nginx HTTPS    ... "
if curl -sfk https://localhost/ > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAILED (check: nginx -t && nginx error.log)"
fi

echo ""
echo "  Active GPU(s):"
nvidia-smi --query-gpu=index,name,memory.total,driver_version --format=csv,noheader 2>/dev/null || echo "  nvidia-smi not available"
ENDSSH

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo ""
if [ -n "${DOMAIN}" ]; then
echo -e "  App URL  :  ${CYAN}https://${DOMAIN}/${NC}"
else
echo -e "  App URL  :  ${CYAN}https://${REMOTE_HOST}/${NC}  (configure DNS → ${REMOTE_HOST})"
fi
echo -e "  API docs :  http://${REMOTE_HOST}:8000/docs"
echo ""
echo -e "  Default login  : ${BOLD}admin / admin${NC}"
echo -e "  ${YELLOW}⚠  Change the password immediately after first login!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo ""
