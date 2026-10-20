@echo off
rem Inicia o AGRO S - Controle Interno (Windows). Deixe esta janela aberta.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install --omit=dev
)
node --disable-warning=ExperimentalWarning server.js
pause
