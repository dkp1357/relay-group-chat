# Relay — Real-time Group Chat

Full-stack group chat with persistent messages, file sharing, and auth.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, served via Nginx |
| Backend | FastAPI + WebSockets |
| Database | PostgreSQL 16 (messages, users, rooms) |
| Pub/Sub | Redis 7 (real-time broadcast) |
| Auth | JWT + bcrypt (or anonymous) |
| Files | Uploaded files persisted in a Docker volume |

## Quick Start

```bash
docker compose up --build
```

- **Frontend** → http://localhost:3000
- **Backend API** → http://localhost:8000
- **API docs** → http://localhost:8000/docs

## Features

- **Login / Register** with username + optional password
- **Anonymous login** — one-click, no credentials saved
- **Dashboard** shows all rooms you've joined
- **Persistent messages** — new joiners see full history
- **File sharing** — files stored in Docker volume, survive restarts
- **Invite links** — shareable `?room=SLUG` URLs
- **Auto-reconnect** — WebSocket reconnects on drop
- **Multi-instance ready** — Redis pub/sub broadcasts across replicas

## Auth Modes

| Mode | How |
|---|---|
| Registered (with password) | Username + password, sessions persist across devices |
| Registered (passwordless) | Username only, login by name — good for trusted contexts |
| Anonymous | Auto-generated `anon_xxxxxx` username, session-only |

## Development (without Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://... REDIS_URL=redis://localhost:6379 uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev   # proxies /api and /ws to :8000
```

## Environment Variables (backend)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | postgres://relay:relaypass@db/relay | PostgreSQL DSN |
| `REDIS_URL` | redis://redis:6379 | Redis DSN |
| `SECRET_KEY` | (change in prod!) | JWT signing key |
| `UPLOAD_DIR` | /uploads | File upload directory |
