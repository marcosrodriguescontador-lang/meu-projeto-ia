@echo off
rem Backup diario do banco do AGRO S (use no Agendador de Tarefas do Windows).
cd /d "%~dp0"
if not exist backup mkdir backup
node --disable-warning=ExperimentalWarning scripts\backup.js >> backup\backup.log 2>&1
