# 01 — Docker Base Image

**Goal:** One command to spin up a container with a virtual desktop you can VNC into.

**What you can test when done:** Run `docker run ...`, open a browser to `localhost:6080`, see a Linux desktop, click around and it works.

---

## TODO

### 1. Create the Dockerfile
- [ ] Base image: `ubuntu:22.04` (stable, wide app support)
- [ ] Install: `xvfb`, `x11vnc`, `openbox` (or `fluxbox`), `xterm`
- [ ] Install noVNC + websockify (bridges VNC to WebSocket): `apt install novnc websockify` or clone from GitHub
- [ ] Set up a startup script that:
  1. Starts `Xvfb :1 -screen 0 1920x1080x24`
  2. Starts `openbox --sm-disable` on display :1
  3. Starts `x11vnc -display :1 -forever -nopw -shared -rfbport 5900`
  4. Starts `websockify --web /usr/share/novnc 6080 localhost:5900`
  5. Starts `xterm` (so there's something to interact with)
- [ ] Location: `docker/base/Dockerfile` and `docker/base/start.sh`

### 2. Build and test
- [ ] `docker build -t canvaflow-desktop docker/base/`
- [ ] `docker run -d -p 6080:6080 -p 5900:5900 canvaflow-desktop`
- [ ] Open `http://localhost:6080/vnc.html` in a browser
- [ ] Verify: you see a desktop, you can open xterm, you can type, you can click
- [ ] Test mouse accuracy — clicks should land exactly where the cursor is

### 3. Configure display resolution
- [ ] Default to 1920x1080 but make it configurable via environment variable
- [ ] `docker run -e RESOLUTION=2560x1440 ...`
- [ ] The Xvfb startup script reads `$RESOLUTION` and applies it

### 4. Minimal security
- [ ] Add VNC password support via environment variable: `-e VNC_PASSWORD=secret`
- [ ] If password is set, x11vnc starts with `-passwd $VNC_PASSWORD`
- [ ] If no password, starts with `-nopw` (fine for local dev)
- [ ] websockify passes auth through to x11vnc automatically

---

## Key Technical Notes

- Xvfb is a virtual framebuffer — it creates a fake display in memory. No GPU needed, no monitor needed. Very lightweight.
- x11vnc reads the Xvfb framebuffer and serves it over VNC protocol. CPU usage is minimal when the display isn't changing.
- websockify is the key piece — it bridges VNC's TCP protocol to WebSocket, which is what noVNC (and our stream node) needs.
- noVNC's built-in web client at `/vnc.html` is just for testing. In milestone 02, we embed our own noVNC client in the node.
- Openbox is ~2MB. It gives you window management (drag, resize, minimize) without the weight of GNOME/KDE.

## Done When
- `docker run -d -p 6080:6080 canvaflow-desktop` and you can interact with a Linux desktop from your browser at `localhost:6080`. Mouse and keyboard work perfectly.
