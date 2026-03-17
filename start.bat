@echo off
echo ========================================================
echo GJC AI-CRM - Start Script (Windows)
echo ========================================================

:: Check for Python
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [Eroare] Python nu este instalat sau nu este în PATH.
    pause
    exit /b 1
)

:: Check for Node.js
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [Eroare] Node.js nu este instalat sau nu este în PATH.
    pause
    exit /b 1
)

echo.
echo [1/2] Pornire Backend (FastAPI)...
cd backend
IF NOT EXIST "venv" (
    echo Creare virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat
echo Instalare dependente backend...
pip install -r requirements.txt >nul 2>&1
start "GJC CRM - Backend" cmd /k "uvicorn server:app --host 0.0.0.0 --port 8001 --reload"

cd ..

echo.
echo [2/2] Pornire Frontend (React)...
cd frontend
echo Instalare dependente frontend...
call npm install --legacy-peer-deps >nul 2>&1
start "GJC CRM - Frontend" cmd /k "npm start"

cd ..

echo.
echo ========================================================
echo GJC AI-CRM a fost pornit cu succes!
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8001
echo ========================================================
echo Apasati orice tasta pentru a inchide aceasta fereastra.
pause >nul
