# 06 — Persistence & Volumes

**Goal:** Container state survives restarts. Files you create inside the container are still there tomorrow.

**What you can test when done:** Create files in a container's terminal, close CanvaFlow, reopen it, reconnect — files are still there. Even after `docker stop` + `docker start`.

---

## TODO

### 1. Named volumes for user data
- [ ] When creating a container, mount a named volume for the home directory:
  `docker run -v canvaflow-<id>-home:/root ...`
- [ ] This persists: files, dotfiles, shell history, editor settings, browser bookmarks
- [ ] Volume name is deterministic from container/node ID so it reconnects automatically

### 2. Project directory bind mounts
- [ ] Option to mount a local directory into the container
- [ ] UI: "Mount folder" button in the container creation flow
- [ ] `docker run -v /Users/you/projects:/root/projects ...`
- [ ] Files edited inside the container appear on the host immediately (and vice versa)
- [ ] Useful for: editing code in the container's IDE while building on the host

### 3. Container commit / snapshot
- [ ] "Save as template" button — runs `docker commit <container> canvaflow-custom-<name>`
- [ ] Creates a new image from the container's current state (installed packages, configs, etc.)
- [ ] The new image appears in the template picker (milestone 04)
- [ ] Useful for: "I set up my dev environment perfectly, I want to reuse this"

### 4. Auto-restart on CanvaFlow launch
- [ ] On CanvaFlow startup, check if any nodes have stored container IDs
- [ ] For each: check if the container exists and is stopped → `docker start <id>`
- [ ] If the container was removed, show "Container not found — create new?" in the node
- [ ] Don't auto-start containers that were explicitly stopped by the user

### 5. Container cleanup
- [ ] Settings page or context menu: "Manage containers"
- [ ] List all canvaflow containers with status, disk usage, age
- [ ] Bulk actions: stop all, remove all, prune unused volumes
- [ ] Warning when removing a container with no committed snapshot

---

## Key Technical Notes

- Docker named volumes persist across container stop/start/remove. Even if you `docker rm` the container, the volume survives. Only `docker volume rm` deletes it.
- Bind mounts (`-v /host/path:/container/path`) have permission implications. Files created inside the container are owned by root. On macOS with Docker Desktop this is handled transparently via gRPC FUSE, but on Linux you'd need uid mapping.
- `docker commit` captures the filesystem diff but NOT running processes. The container needs to be restarted to resume apps. This is fine — the startup script re-launches everything.
- Container disk usage can grow over time. `docker system df` shows total usage. Consider a periodic reminder if canvaflow containers exceed a threshold (e.g. 10GB).
- For the auto-restart flow, use `docker inspect` to check if a container exists and get its status. This is fast (~50ms).

## Done When
- Close CanvaFlow, reopen it, and all your container nodes reconnect automatically. Files you created yesterday are still there. You can save a customized container as a reusable template.
