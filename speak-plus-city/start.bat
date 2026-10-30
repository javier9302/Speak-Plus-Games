@echo off
rem Speak Plus City - double-click on Windows.
rem With Node.js: the game server, so students can also play with their phones.
rem Without Node.js: a simple Python server (the game works, but without phones).
cd /d "%~dp0"
set PORT=8080
echo Speak Plus City: http://localhost:%PORT%/
echo Keep this window open while you play. Close it to stop.
start "" /min powershell -NoProfile -Command "Start-Sleep 3; Start-Process 'http://localhost:%PORT%/'"

where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist node_modules call npm install --omit=dev --no-audit --no-fund
node server\index.js
goto :eof

:nonode
echo (Node.js is not installed: the game works, but not with phones. Get it at nodejs.org.)
where py >nul 2>nul
if not errorlevel 1 (py -3 -m http.server %PORT% & goto :eof)
where python >nul 2>nul
if not errorlevel 1 (python -m http.server %PORT% & goto :eof)
echo Install Node.js (nodejs.org) or Python 3 (python.org) and try again.
pause
