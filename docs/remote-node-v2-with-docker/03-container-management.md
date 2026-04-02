# 03 — Container Management from CanvaFlow

**Goal:** Create, start, stop, and destroy Docker containers directly from the CanvaFlow UI. No terminal needed.

**What you can test when done:** Right-click canvas > "New Remote Desktop" > pick a template > container spins up automatically > you're interacting with it in seconds.

---

## TODO

### 1. Docker IPC handlers in the main process
- [ ] New module: `src/plugins/remotestream/main/docker.ts`
- [ ] Uses `child_process.execFile` to run `docker` CLI commands
- [ ] IPC handlers:
  - `remotestream:docker:list` — list running canvaflow containers (`docker ps --filter label=canvaflow`)
  - `remotestream:docker:create` — `docker run -d -l canvaflow -p <port>:6080 <image>`, returns container ID + assigned port
  - `remotestream:docker:stop` — `docker stop <id>`
  - `remotestream:docker:remove` — `docker rm <id>`
  - `remotestream:docker:status` — `docker inspect <id>` for health/status

### 2. Auto port assignment
- [ ] When creating a container, find an available port starting from 6080
- [ ] Check ports 6080-6180, use the first one not in use
- [ ] Store the mapping: container ID → port in node props
- [ ] This way multiple containers can run simultaneously

### 3. Node creation flow
- [ ] New option in RemoteStreamNode's connect phase: "New Container" button
- [ ] Click it → shows a dropdown of available images (from `docker images --filter label=canvaflow`)
- [ ] Select an image → creates container → auto-connects when ready
- [ ] Store container ID in node props so we can manage it later
- [ ] Also keep "Connect to existing" for manual address entry

### 4. Container lifecycle tied to node
- [ ] When node is created with "New Container", the node owns that container
- [ ] Deleting the node prompts: "Stop and remove container?" with yes/no
- [ ] Closing CanvaFlow: containers keep running (they're Docker containers, they survive)
- [ ] Reopening CanvaFlow: nodes reconnect to their containers automatically using stored container ID

### 5. Status indicators
- [ ] Bottom bar shows container status: starting / running / stopped
- [ ] If container is stopped, show a "Start" button
- [ ] If container is starting, show a spinner
- [ ] If container crashes, show error with "Restart" button

---

## Key Technical Notes

- We use the `docker` CLI rather than the Docker API directly. It's simpler and the CLI is always available when Docker Desktop is installed. The Docker socket API is an optimization for later.
- Label all canvaflow containers with `-l canvaflow=true` so we can filter them from the user's other containers.
- Port assignment is the trickiest part — two nodes creating containers at the same time could race. Use a simple lock or just retry on port conflict.
- Container startup takes 1-3 seconds. Show a progress state in the node during that time.
- `docker inspect --format '{{.State.Status}}'` gives you running/exited/created quickly.

## Done When
- You can create a new container from the CanvaFlow UI, interact with it, stop it, restart it, and delete it — all without touching a terminal.
