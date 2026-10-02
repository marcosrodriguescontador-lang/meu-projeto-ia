@echo off
chcp 65001 >nul
title Auditor Systema
cd /d "%~dp0"

rem Procura o Python: primeiro o lancador "py" (instalado pelo python.org), depois "python".
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
    python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo.
    echo Python nao encontrado. Instale em https://www.python.org/downloads/
    echo Na instalacao, marque a opcao "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Preparando o ambiente pela primeira vez. Isso leva alguns minutos...
    %PY% -m venv .venv
)

echo Verificando bibliotecas...
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet --disable-pip-version-check
if errorlevel 1 (
    echo.
    echo Ocorreu um erro ao instalar as bibliotecas. Tire um print desta janela e envie para o suporte.
    pause
    exit /b 1
)

echo.
rem Evita a pergunta de e-mail do Streamlit na primeira execucao.
if not exist "%USERPROFILE%\.streamlit\credentials.toml" (
    mkdir "%USERPROFILE%\.streamlit" 2>nul
    > "%USERPROFILE%\.streamlit\credentials.toml" echo [general]
    >> "%USERPROFILE%\.streamlit\credentials.toml" echo email = ""
)
echo Abrindo o Auditor no navegador. Para encerrar, feche esta janela.
".venv\Scripts\python.exe" -m streamlit run app.py --server.headless false
pause
