# 🧙‍♂️ Storybox Setup Log
*Raspberry Pi 4B running Vite + React frontend and Express backend in kiosk mode on Raspberry Pi OS Lite*

---

## ⚙️ 1. Flash & Initial Setup

- Flashed microSD card with: **Raspberry Pi OS Lite (64-bit)**
- Configuration via Raspberry Pi Imager:
  - **Hostname:** `storybox`
  - **Wi-Fi:** Credentials set
  - **Username/Password:** Set
- Inserted into Raspberry Pi and powered on.

---

## 🔌 2. First Boot & Local Setup

- Connected USB keyboard
- Logged in with user credentials

### Checked Wi-Fi & SSH:
```bash
sudo systemctl status ssh
sudo systemctl enable ssh
sudo systemctl start ssh
iwgetid  # Confirmed Wi-Fi connected
```

---

## 🖥️ 3. SSH Access

From local machine:
```bash
ssh robertscott@storybox.local
```

---

## 📦 4. System Update
```bash
sudo apt update && sudo apt upgrade -y
```

---

## 🛠️ 5. Install Node.js + Git
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install -y git
```

---

## 🌱 6. Create Vite + React App
```bash
cd ~/storybox
npm create vite@latest ui
# Choose: > React > JavaScript or TypeScript
cd ui
npm install
npm run build
```

---

## 🔧 7. Create Lightweight Express Server
```bash
cd ~/storybox
mkdir server && cd server
npm init -y
npm install express
```
Create `index.js`:
```js
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.resolve(__dirname, '../ui/dist')));

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

app.use((req, res) => {
  res.sendFile(path.resolve(__dirname, '../ui/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Storybox server running at http://localhost:${PORT}`);
});
```
Test with:
```bash
node index.js
```

---

## 🔁 8. Set Up PM2 to Run Express on Boot
```bash
sudo npm install -g pm2
cd ~/storybox/server
pm2 start index.js --name storybox-server
pm2 save
pm2 startup
```
Then run the command PM2 gives you, e.g.:
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u robertscott --hp /home/robertscott
```

---

## 🧰 9. Install Minimal GUI + Chromium
```bash
sudo apt install --no-install-recommends xserver-xorg x11-xserver-utils xinit openbox chromium-browser -y
```

---

## 🧼 10. Install LightDM for Autologin GUI
```bash
sudo apt install lightdm -y
```
Configure autologin:
```bash
sudo raspi-config
# System Options > Boot / Auto Login > Desktop Autologin
```

---

## 🌐 11. Configure Chromium Kiosk Mode
Edit autostart file:
```bash
nano ~/.config/openbox/autostart
```
Add:
```bash
unclutter-xfixes --touch --noevents &
sleep 2
chromium-browser --kiosk http://localhost:3000
```

---

## 🖱️ 12. Hide Mouse Cursor
```bash
sudo apt remove unclutter -y
sudo apt install unclutter-xfixes -y
```

---

✅ **Result:**

Your Storybox device now:
- Boots directly into a lightweight GUI
- Auto-starts the Express server serving your React/Vite app
- Launches Chromium in fullscreen pointing to `localhost:3000`
- Hides the mouse for a polished, touch-friendly UX
- Runs headlessly and auto-recovers with PM2

---


