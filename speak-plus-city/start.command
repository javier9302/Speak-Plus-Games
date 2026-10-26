#!/bin/bash
# Speak Plus City — double-click on a Mac (or run ./start.command on Linux).
# Starts a small local web server in this folder and opens the start page.
cd "$(dirname "$0")"
PORT=8080
URL="http://localhost:$PORT/"
echo "Speak Plus City: $URL"
echo "Keep this window open while you play. Close it to stop."
( sleep 1.5; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve -l "$PORT" .
else
  echo "Install Python 3 (python.org) or Node.js (nodejs.org) and try again."
  read -r -p "Press Enter to close."
fi
