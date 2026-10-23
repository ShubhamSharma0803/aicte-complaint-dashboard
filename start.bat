@echo off
title AICTE Integrated Institution Complaint Monitoring Dashboard
cd /d "%~dp0"

echo ======================================================================
echo    AICTE Integrated Institution Complaint Monitoring Dashboard
echo ======================================================================

echo [1/3] Checking and installing requirements quietly if needed...
py -m pip install -q -r requirements.txt

if not exist aicte.db (
    echo [2/3] Database not found. Seeding initial data...
    py seed.py
) else (
    echo [2/3] Database aicte.db already exists.
)

echo [3/3] Opening dashboard in browser and starting Uvicorn server...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8000"
echo Server active at http://127.0.0.1:8000 (Press Ctrl+C to terminate)
py -m uvicorn main:app --port 8000
