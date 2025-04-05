# Storybox Project

This project runs a React/Vite frontend and an Express backend on a Raspberry Pi in Kiosk mode.

See `docs/setup-notes.md` for detailed setup instructions.

## Development Modes

### 1. Local Development (Recommended for Most Work)

Run the frontend and backend development servers directly on your main computer for the fastest iteration cycle.

1.  Ensure Node.js/npm are installed locally.
2.  Install dependencies:
    ```bash
    cd path/to/storybox/ui && npm install
    cd path/to/storybox/server && npm install
    ```
3.  Run dev servers in separate terminals:
    *   `cd path/to/storybox/server && npm run dev`
    *   `cd path/to/storybox/ui && npm run dev`
4.  Access the UI in your browser at `http://localhost:5173` (or the port Vite specifies).

### 2. On-Device Development (Testing on Pi Display)

Use this mode when you need to edit code on the Raspberry Pi (via SSH/Cursor) and see the hot-reloading changes directly on the Pi's connected display.

**Prerequisites:**

*   You are SSH'd into the Raspberry Pi (`storybox.local`).
*   The development dependencies are installed (`cd ~/storybox/server && npm install`, `cd ~/storybox/ui && npm install`).

**To Start On-Device Dev Mode:**

*   Run the start script from your SSH session:
    ```bash
    ~/storybox/scripts/start-dev-display.sh
    ```
*   This script will:
    *   Stop the production server (pm2).
    *   Kill the Kiosk browser.
    *   Start the backend (`nodemon`) and frontend (`vite --host`) dev servers in the background.
    *   Launch a new Chromium instance on the Pi's display pointing to the Vite dev server (`http://localhost:5173`).
*   Edit files in `~/storybox/ui/src` via Cursor/SSH.
*   Changes should now hot-reload on the Pi's display.
*   Check logs in `/tmp/storybox-*.log` if issues arise.

**To Stop On-Device Dev Mode & Return to Production:**

*   Run the stop script from your SSH session:
    ```bash
    ~/storybox/scripts/stop-dev-display.sh
    ```
*   This script will:
    *   Stop the background dev servers and the dev Chromium instance.
    *   Restart the production server (pm2).
    *   The standard Kiosk browser should relaunch automatically via Openbox.

**Alternatively:**

*   Simply rebooting the Raspberry Pi (`sudo reboot`) will also stop all development processes and return the device to its standard production Kiosk mode on startup.

## Production Build

To create a production build of the UI:

```bash
cd ~/storybox/ui
npm run build
```

The production server (managed by PM2) automatically serves files from `~/storybox/ui/dist`. 