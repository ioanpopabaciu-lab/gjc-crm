@echo off
TITLE GJC AI-CRM - Start Script
COLOR 0A

echo.
echo ============================================
echo    GJC AI-CRM - Pornire Aplicatie
echo ============================================
echo.

:: Check Python
echo [1/6] Verificare Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [EROARE] Python nu este instalat sau nu este in PATH
    echo Descarca de la: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python gasit

:: Check Node.js
echo [2/6] Verificare Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [EROARE] Node.js nu este instalat sau nu este in PATH
    echo Descarca de la: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js gasit

:: Setup Backend
echo [3/6] Configurare Backend...
cd backend

if not exist "venv" (
    echo Creare virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

echo Instalare dependente Python...
pip install -r requirements.txt --quiet

if not exist ".env" (
    echo Creare fisier .env din template...
    copy .env.example .env
)

cd ..

:: Setup Frontend
echo [4/6] Configurare Frontend...
cd frontend

if not exist "node_modules" (
    echo Instalare dependente Node.js (poate dura cateva minute)...
    call npm install --legacy-peer-deps --silent
)

if not exist ".env" (
    echo Creare fisier .env din template...
    copy .env.example .env
)

cd ..

:: Start Backend in new window
echo [5/6] Pornire Backend (port 8001)...
start "GJC Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn server:app --host 0.0.0.0 --port 8001 --reload"

:: Wait for backend to start
timeout /t 5 /nobreak >nul

:: Start Frontend in new window
echo [6/6] Pornire Frontend (port 3000)...
start "GJC Frontend" cmd /k "cd frontend && npm start"

echo.
echo ============================================
echo    APLICATIA PORNESTE!
echo ============================================
echo.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8001
echo API Docs: http://localhost:8001/docs
echo.
echo Credentiale test:
echo   Email: ioan@gjc.ro
echo   Parola: GJC2026admin
echo.
echo Apasa orice tasta pentru a inchide aceasta fereastra...
echo (Serverele vor continua sa ruleze in background)
pause >nul
