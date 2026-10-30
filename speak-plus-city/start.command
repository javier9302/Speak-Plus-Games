#!/bin/bash
# Speak Plus City — double-click on a Mac (or run ./start.command on Linux).
# With Node.js: starts the game server, so students can also play with their phones.
# Without Node.js: starts a simple Python server (the game works, but without phones).
cd "$(dirname "$0")"
PORT=8080
URL="http://localhost:$PORT/"
echo "Speak Plus City: $URL"
echo "Keep this window open while you play. Close it to stop."
( sleep 2; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  [ -d node_modules ] || npm install --omit=dev --no-audit --no-fund
  PORT=$PORT node server/index.js
elif command -v python3 >/dev/null 2>&1; then
  echo "(Node.js is not installed: the game works, but not with phones. Get it at nodejs.org.)"
  python3 -m http.server "$PORT"
else
  echo "Install Node.js (nodejs.org) or Python 3 (python.org) and try again."
  read -r -p "Press Enter to close."
fi
