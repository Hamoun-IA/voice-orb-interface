#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="/root/projects/voice-orb-interface/web/"
DEST_DIR="/var/www/test.hamoun.fun/"

mkdir -p "$DEST_DIR"
rsync -av --delete "$SRC_DIR" "$DEST_DIR"
chown -R caddy:caddy "$DEST_DIR"
chmod -R 755 "$DEST_DIR"

echo "Deployed voice-orb-interface to $DEST_DIR"
