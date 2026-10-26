@echo off
rem Speak Plus City - double-click on Windows.
rem Starts a small local web server in this folder and opens the start page.
cd /d "%~dp0"
set PORT=8080
echo Speak Plus City: http://localhost:%PORT%/
echo Keep this window open while you play. Close it to stop.
start "" /min powershell -NoProfile -Command "Start-Sleep 2; Start-Process 'http://localhost:%PORT%/'"
where py >nul 2>nul && (py -3 -m http.server %PORT% & goto :eof)
where python >nul 2>nul && (python -m http.server %PORT% & goto :eof)
where npx >nul 2>nul && (npx --yes serve -l %PORT% . & goto :eof)
echo Install Python 3 (python.org) or Node.js (nodejs.org) and try again.
pause
