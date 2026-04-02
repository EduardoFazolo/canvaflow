# 04 — Prebuilt Environment Templates

**Goal:** One-click containers with common tools pre-installed. "I want a browser" → done. "I want a dev environment" → done.

**What you can test when done:** Open a new Remote Desktop node, pick "Browser" from templates, and a container with Firefox/Chromium launches in seconds ready to browse.

---

## TODO

### 1. Define template Dockerfiles
- [ ] All in `docker/templates/`, each extending the base image from milestone 01
- [ ] Templates:

**Browser** (`docker/templates/browser/Dockerfile`)
- [ ] Base image + `chromium-browser` or `firefox`
- [ ] Auto-launches the browser on startup
- [ ] Good for: web browsing, testing, web apps

**Dev** (`docker/templates/dev/Dockerfile`)
- [ ] Base image + `nodejs`, `python3`, `git`, `curl`, `vim`
- [ ] Installs VS Code via code-server (web-based VS Code) or just `nano`/`vim` with a terminal
- [ ] Good for: coding, running scripts, development

**Terminal** (`docker/templates/terminal/Dockerfile`)
- [ ] Base image + `zsh`, `tmux`, `htop`, `curl`, `git`
- [ ] Minimal — just a nice terminal environment
- [ ] Good for: SSH into things, running commands, monitoring

**Android Dev** (`docker/templates/android/Dockerfile`)
- [ ] Base image + Android SDK CLI tools, `adb`, Java JDK
- [ ] Note: Android Studio GUI is heavy — maybe just the SDK tools + a terminal
- [ ] Good for: building Android apps, running emulators (if KVM is available)

### 2. Build script
- [ ] `docker/build-all.sh` — builds all templates and tags them
- [ ] Tags: `canvaflow-browser`, `canvaflow-dev`, `canvaflow-terminal`, etc.
- [ ] Labels each with `canvaflow=true` and `canvaflow-template=<name>`

### 3. Template picker in the UI
- [ ] When creating a new container (milestone 03), show template cards
- [ ] Each card: icon, name, description, estimated size
- [ ] If the image isn't built yet, show a "Build" button (runs docker build)
- [ ] If already built, show "Create" button (instant)

### 4. Template customization
- [ ] Each template has a `config.json` with:
  - `name`, `description`, `icon`
  - `defaultResolution` (e.g. "1920x1080")
  - `startupApps` (what to auto-launch)
  - `ports` (additional ports to expose, e.g. 3000 for dev servers)
- [ ] User can create custom templates by adding a folder to `docker/templates/`

---

## Key Technical Notes

- Keep images small. The base image (Ubuntu + Xvfb + VNC + noVNC + Openbox) should be ~200-300MB. Each template adds the specific tools on top.
- Pre-building images avoids the wait on first use. Include a `bun run docker:build` script.
- For the browser template, Chromium in Docker needs `--no-sandbox` flag (runs as root in container). This is fine for a dev container, not for production.
- VS Code in the dev template: `code-server` is the easiest path — it's a web-based VS Code that runs in the container. But since we're already VNC-ing in, regular VS Code would work too if you install it.
- Android emulator in Docker requires KVM. On macOS with Docker Desktop, this isn't available. The Android template is more useful for CLI tools / building APKs than running emulators.

## Done When
- You can pick "Browser" from the template list, a container spins up with Chromium, and you're browsing the web inside a CanvaFlow node within 5 seconds.
