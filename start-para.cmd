@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.13 veya daha yeni bir surum gerekli: https://nodejs.org/
  pause
  exit /b 1
)
node scripts/start-local.js
if errorlevel 1 (
  echo PARA baslatilamadi. Yukaridaki hatayi kontrol edin.
  pause
  exit /b 1
)
endlocal
