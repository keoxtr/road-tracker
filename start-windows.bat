@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  node server.mjs
  goto :eof
)

set BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" server.mjs
  goto :eof
)

echo Node.js bulunamadi. https://nodejs.org adresinden Node.js kurup tekrar deneyin.
pause
