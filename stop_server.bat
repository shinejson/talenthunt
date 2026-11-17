@echo off
title Stop StageLight Server (Port 5050)
echo ==========================================================
echo Stopping StageLight server on port 5050...
echo ==========================================================

set found=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5050 ^| findstr LISTENING') do (
    set found=1
    echo Terminating PID: %%a
    taskkill /f /pid %%a >nul 2>&1
)

if "%found%"=="0" (
    echo No active process found listening on port 5050.
) else (
    echo Done. Port 5050 is now released.
)

echo.
timeout /t 2 >nul
