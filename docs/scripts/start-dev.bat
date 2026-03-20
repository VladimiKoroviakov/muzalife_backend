@echo off
REM =============================================================================
REM MuzaLife Backend — Development Startup Script (Windows)
REM
REM Usage:
REM   Double-click or run from cmd: docs\scripts\start-dev.bat
REM =============================================================================

SETLOCAL ENABLEDELAYEDEXPANSION

SET "SCRIPT_DIR=%~dp0"
SET "PROJECT_ROOT=%SCRIPT_DIR%..\..\"
CD /D "%PROJECT_ROOT%"

ECHO.
ECHO ============================================
ECHO   MuzaLife Backend - Development Startup
ECHO ============================================
ECHO.

REM Check Node.js
WHERE node >NUL 2>&1
IF ERRORLEVEL 1 (
  ECHO [ERROR] Node.js is not installed. Download from https://nodejs.org
  PAUSE
  EXIT /B 1
)
FOR /F "tokens=*" %%i IN ('node -v') DO SET NODE_VER=%%i
ECHO [OK]    Node.js %NODE_VER%

REM Check .env
IF NOT EXIST ".env" (
  ECHO [ERROR] .env file not found. Create it from the template in README.md.
  PAUSE
  EXIT /B 1
)
ECHO [OK]    .env found

REM Check SSL certs
IF NOT EXIST "certs\localhost-key.pem" (
  ECHO [ERROR] SSL certificate not found: certs\localhost-key.pem
  ECHO         Generate with mkcert:
  ECHO           mkcert -cert-file certs\localhost-cert.pem -key-file certs\localhost-key.pem localhost
  PAUSE
  EXIT /B 1
)
IF NOT EXIST "certs\localhost-cert.pem" (
  ECHO [ERROR] SSL certificate not found: certs\localhost-cert.pem
  PAUSE
  EXIT /B 1
)
ECHO [OK]    SSL certificates found

REM Install dependencies if needed
IF NOT EXIST "node_modules" (
  ECHO [INFO]  node_modules not found. Running npm install...
  CALL npm install
  IF ERRORLEVEL 1 (
    ECHO [ERROR] npm install failed.
    PAUSE
    EXIT /B 1
  )
)
ECHO [OK]    Dependencies installed

ECHO.
ECHO [INFO]  Starting development server...
ECHO         URL:      https://localhost:5001
ECHO         API Docs: https://localhost:5001/api/docs
ECHO.

CALL npm run dev

PAUSE
