# Remote Node v2 — Docker + noVNC

Interactive remote desktop nodes that actually work. Each node connects to a Docker container running a Linux desktop with a VNC server. noVNC (a JS VNC client) handles both video and input natively — no custom capture, no CGEvent hacks.

## Why Docker?

macOS blocks mouse injection into background windows by design. There's no workaround. Inside a Docker container, the apps ARE the foreground — input just works. VNC was literally built for this.

## Architecture

```
Docker container (one per environment)
├── Xvfb          — virtual display (no physical monitor needed)
├── Openbox       — lightweight window manager
├── x11vnc        — VNC server exposing the virtual display
├── noVNC/websockify — WebSocket bridge (VNC over ws://)
└── Apps          — browser, terminal, IDE, whatever you install

CanvaFlow
└── RemoteStreamNode
    └── Embedded noVNC client
        └── connects via WebSocket to container
        └── renders frames + forwards mouse/keyboard natively
```

## Milestone Order

1. **[01-docker-base.md](01-docker-base.md)** — Dockerfile with Xvfb + VNC + noVNC, one command to spin up
2. **[02-novnc-node.md](02-novnc-node.md)** — Embed noVNC in the stream node, connect to a container
3. **[03-container-management.md](03-container-management.md)** — Create/start/stop containers from within CanvaFlow
4. **[04-prebuilt-environments.md](04-prebuilt-environments.md)** — Template containers (browser, dev, etc.) with apps pre-installed
5. **[05-multi-node-one-container.md](05-multi-node-one-container.md)** — Multiple nodes connected to one container showing different apps
6. **[06-persistence.md](06-persistence.md)** — Volume mounts, saving container state, surviving restarts

Each milestone is testable on its own.
