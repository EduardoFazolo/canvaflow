# 06 — Remote Machine Streaming

**Goal:** Stream windows from other machines on the network, not just the local Mac. Run your heavy IDE on a beefy desktop, stream it to CanvaFlow on your laptop.

**What you can test when done:** Install a lightweight agent on another machine. In CanvaFlow, connect to that machine and pick a window to stream. Interact with it as if it were local.

---

## TODO

### 1. Design the agent
- [ ] Small standalone binary that runs on the remote machine
- [ ] On startup: enumerates windows (reuse existing Swift logic for macOS, implement equivalents for Windows/Linux)
- [ ] Exposes a WebSocket/HTTP API:
  - `GET /windows` — list available windows with thumbnails
  - `POST /stream/:windowId` — start a WebRTC stream of that window
  - `POST /input/:windowId` — receive and inject mouse/keyboard events
  - `POST /stream/:windowId/stop` — stop streaming
- [ ] Agent handles: window capture, encoding (hardware-accelerated), WebRTC signaling, input injection
- [ ] Agent should be as small and dependency-free as possible

### 2. WebRTC signaling between CanvaFlow and remote agent
- [ ] Agent acts as a WebRTC peer — it creates an offer/answer via its HTTP API
- [ ] CanvaFlow (in the renderer) creates a peer connection and exchanges SDP via the agent's API
- [ ] ICE candidates exchanged over the same WebSocket connection
- [ ] For LAN: direct peer-to-peer connection (no TURN server needed)
- [ ] For internet: would need a TURN server (out of scope for this milestone, note it as future work)

### 3. Remote window picker UI
- [ ] New mode in RemoteStreamNode: "Remote Machine" (alongside local window picking)
- [ ] User enters the agent's address (e.g. `192.168.1.50:9876`)
- [ ] Node fetches window list from remote agent and displays the same picker UI
- [ ] On selection: establish WebRTC connection and show the stream
- [ ] Save known remote machines for quick reconnect

### 4. Input forwarding over the network
- [ ] Same input events from milestone 02, but sent to the remote agent instead of local Swift helper
- [ ] Send over a WebRTC data channel (low latency, already established)
- [ ] Agent receives input events and injects them using platform-native APIs
- [ ] Latency will be higher than local — show a subtle latency indicator

### 5. Connection management
- [ ] Handle disconnection gracefully — show "Reconnecting..." state, auto-retry
- [ ] Handle agent going offline — freeze on last screenshot, show offline badge
- [ ] mDNS/Bonjour discovery for agents on the local network (nice-to-have)
- [ ] Authentication: at minimum, a shared secret/token so random people on the network can't connect to your agent

---

## Key Technical Notes

- This is where the architecture mirrors Chrome Remote Desktop. The agent is essentially a lightweight remote desktop server, and CanvaFlow is the client.
- For the MVP of this milestone, macOS-only agent is fine. Cross-platform agents (Windows, Linux) are a follow-up.
- WebRTC is the right transport — it handles NAT traversal, adaptive bitrate, packet loss recovery, and low-latency delivery. Don't reinvent this with raw WebSockets.
- Hardware encoding on the remote agent is critical for CPU usage. VideoToolbox (macOS), NVENC (NVIDIA), QuickSync (Intel), VAAPI (Linux). Without hardware encoding, a single 1080p30 stream will eat a full CPU core.
- Security matters here. The agent is literally a remote desktop server. Require auth, use TLS (or rely on WebRTC's built-in DTLS), and maybe bind to localhost by default requiring explicit config to expose on the network.
- LAN latency (sub-5ms network) + WebRTC + hardware encode/decode should give end-to-end latency of ~50-80ms. Feels good for productivity apps, not for gaming.

## Done When
- You can install the agent on another Mac, connect to it from CanvaFlow, pick a window, see it stream in real-time, and interact with it — all from a different machine.

---

## Future Work (Beyond This Milestone)
- [ ] TURN server support for internet-based streaming (not just LAN)
- [ ] Windows and Linux agents
- [ ] Multi-monitor support on remote machines
- [ ] File transfer between local and remote via drag-and-drop on the canvas
- [ ] Audio forwarding from remote apps
- [ ] Session persistence — reconnect to the same windows after restarting CanvaFlow
