#!/bin/bash

# ~/storybox/scripts/start-dev-display.sh
# Switches from production Kiosk mode to on-device development mode.

echo "Switching to On-Device Development Mode..."

# Stop Production Server
echo "Stopping production server (PM2)..."
pm2 stop storybox-server || echo "Warning: Failed to stop storybox-server (maybe not running?)"

# Kill Kiosk Browser
echo "Stopping existing Chromium instance(s)..."
pkill -o -f chromium-browser # -o kills the oldest matching process, good for kiosk
sleep 2 # Give it a moment to close

# Start Backend Dev Server (in background)
echo "Starting backend dev server (server/)..."
cd ~/storybox/server || exit 1
npm run dev &> /tmp/storybox-backend-dev.log & # Run in background, log to /tmp
BACKEND_PID=$!
echo "Backend server PID: $BACKEND_PID"
sleep 3 # Give server time to start

# Start Frontend Dev Server (in background)
echo "Starting frontend dev server (ui/)..."
cd ~/storybox/ui || exit 1
# Ensure Vite listens on all interfaces
npm run dev -- --host &> /tmp/storybox-frontend-dev.log & # Run in background, log to /tmp
FRONTEND_PID=$!
echo "Frontend server PID: $FRONTEND_PID"
sleep 5 # Give Vite more time to start

# Launch Chromium pointing to Vite Dev Server
echo "Launching Chromium on display :0 pointing to Vite (localhost:5173)..."
export DISPLAY=:0
# Using --incognito might help avoid cache issues during dev
chromium-browser --no-sandbox --incognito http://localhost:5173 &> /tmp/storybox-chromium-dev.log &
CHROMIUM_PID=$!
echo "Chromium PID: $CHROMIUM_PID"


echo "-----------------------------------------------------"
echo "On-Device Development Mode Activated."
echo "- Backend Logs: /tmp/storybox-backend-dev.log"
echo "- Frontend Logs: /tmp/storybox-frontend-dev.log"
echo "- Chromium Logs: /tmp/storybox-chromium-dev.log"
echo "- To stop, run: ~/storybox/scripts/stop-dev-display.sh"
echo "-----------------------------------------------------"

# Optional: Store PIDs for the stop script (simple method)
mkdir -p ~/storybox/scripts/.pids
echo $BACKEND_PID > ~/storybox/scripts/.pids/backend.pid
echo $FRONTEND_PID > ~/storybox/scripts/.pids/frontend.pid
echo $CHROMIUM_PID > ~/storybox/scripts/.pids/chromium.pid 