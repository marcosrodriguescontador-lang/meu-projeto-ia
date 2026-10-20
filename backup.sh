#!/bin/sh
# Backup diário do banco do AGRO S (use no cron do Linux).
cd "$(dirname "$0")" || exit 1
mkdir -p backup
node --disable-warning=ExperimentalWarning scripts/backup.js >> backup/backup.log 2>&1
