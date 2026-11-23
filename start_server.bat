@echo off
title StageLight Talent Hunt Server (Port 5050)
cd /d "%~dp0"

echo ==========================================================
echo StageLight Talent Hunt ^& Voting Platform Server
echo ==========================================================

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment ^(.venv^) not found!
    echo Please set up your environment by running:
    echo   python -m venv .venv
    echo   .venv\Scripts\pip install -r backend\requirements.txt
    echo.
    pause
    exit /b 1
)

REM Check if port 5050 is in use
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5050 ^| findstr LISTENING') do (
    echo [INFO] Port 5050 was in use by PID %%a. Freeing port...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo Starting unified server:
echo   - Web App (SPA): http://localhost:5050/
echo   - Admin Console: http://localhost:5050/admin
echo   - Backend API  : http://localhost:5050/api/v1/
echo   - Health check : http://localhost:5050/api/v1/health
echo.
echo Press Ctrl+C in this window to stop the server.
echo ==========================================================
echo.

set PORT=5050
.\.venv\Scripts\python.exe backend\wsgi.py

if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with an error code.
    pause
)
