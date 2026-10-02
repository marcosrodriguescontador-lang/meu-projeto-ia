@echo off
chcp 65001 >nul
title Auditor Systema
cd /d "%~dp0"

where python >/dev/null 2>nul
if errorlevel 1 (
    echo.
    echo Python nao encontrado. Instale em https://www.python.org/downloads/
    echo Na instalacao, marque a opcao "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Preparando o ambiente pela primeira vez. Isso leva alguns minutos...
    python -m venv .venv
)

echo Verificando bibliotecas...
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet --disable-pip-version-check

echo.
echo Abrindo o Auditor no navegador. Para encerrar, feche esta janela.
".venv\Scripts\python.exe" -m streamlit run app.py --server.headless false
pause
