#!/bin/sh
# Inicia o AGRO S - Controle Interno (Linux).
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install --omit=dev
exec node --disable-warning=ExperimentalWarning server.js
