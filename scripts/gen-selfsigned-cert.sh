#!/usr/bin/env bash
# Generate a self-signed TLS certificate for the ModZero FYP demo.
#
# Usage:   scripts/gen-selfsigned-cert.sh [CN]
# Default: CN=localhost
#
# Outputs into ./certs/  (gitignored).
#   modzero.crt  — fullchain self-signed cert (PEM)
#   modzero.key  — private key (PEM, 2048-bit RSA)
#
# Mount in production compose:
#   volumes:
#     - ./certs:/etc/nginx/certs:ro

set -euo pipefail

CN="${1:-localhost}"
OUT_DIR="${OUT_DIR:-./certs}"
DAYS="${DAYS:-365}"

mkdir -p "${OUT_DIR}"

openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "${OUT_DIR}/modzero.key" \
    -out    "${OUT_DIR}/modzero.crt" \
    -days "${DAYS}" \
    -subj "/CN=${CN}/O=ModZero/OU=FYP" \
    -addext "subjectAltName=DNS:${CN},DNS:localhost,IP:127.0.0.1"

chmod 600 "${OUT_DIR}/modzero.key"
chmod 644 "${OUT_DIR}/modzero.crt"

echo "Wrote ${OUT_DIR}/modzero.crt  (CN=${CN}, ${DAYS}d)"
echo "Wrote ${OUT_DIR}/modzero.key"
