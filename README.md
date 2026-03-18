# Relay — Real-time Group Chat

A full-stack real-time group chat system with persistent messaging, file sharing, and multiple authentication modes. Designed for horizontal scalability using Redis pub/sub and containerized deployment.

---

## Architecture Overview

- **Client → Backend (WebSocket + HTTP)** for real-time messaging and API operations
- **Backend → Redis (Pub/Sub)** for broadcasting messages across instances
- **Backend → PostgreSQL** for persistence (users, rooms, messages)
- **Backend → Volume Storage** for file uploads

---

## Tech Stack

| Layer    | Technology                         |
| -------- | ---------------------------------- |
| Frontend | React 18 + Vite (served via Nginx) |
| Backend  | FastAPI + WebSockets               |
| Database | PostgreSQL 16                      |
| Pub/Sub  | Redis 8.4                          |
| Auth     | JWT + Argon2                       |
| Storage  | Docker volume (file persistence)   |

---

## Setup

### 1. Environment Variables

Create a `.env` file using `.env.example`:

```bash
cp .env.example .env
```

Fill required values:

- Database credentials
- Redis URL
- JWT secret
- Backend URL

---

### 2. Run with Docker

```bash
docker compose up --build
```

---

## Services

| Service     | URL                        |
| ----------- | -------------------------- |
| Frontend    | http://localhost:5173      |
| Backend API | http://localhost:8000      |
| API Docs    | http://localhost:8000/docs |

---

## Core Features

### Authentication

- Username + password login (persistent)
- Anonymous login (`anon_xxxxxx`, session-based)

---

### Chat System

- Real-time messaging via WebSockets
- Persistent message history (stored in PostgreSQL)
- Users joining later can view previous messages

---

### Rooms

- Create chat rooms
- Join via invite links:

  ```
  http://localhost:3000/?room=<ROOM_SLUG>
  ```

- Dashboard shows joined rooms

---

### File Sharing

- Upload files in chat
- Files stored in Docker volume
- Survive container restarts

---

### Reliability

- Automatic WebSocket reconnection on disconnect
- Stateless backend instances
- Redis pub/sub ensures cross-instance message sync

---

## Auth Modes Explained

| Mode                  | Behavior                                |
| --------------------- | --------------------------------------- |
| Registered (password) | Secure login, persistent across devices |
| Anonymous             | Temporary session, random username      |

---

## API Highlights

- REST endpoints for:
  - Auth (login/register)
  - Room management
  - File upload/download

- WebSocket endpoint:
  - Real-time messaging
  - Room-based broadcasting

---

## Deployment Notes

- Frontend served via Nginx
- Backend is stateless → scale horizontally
- Redis required for multi-instance sync
- PostgreSQL handles persistence
- Uses reverse proxy (Nginx)

---

## Possible Improvements

- Message reactions and typing indicators
- Read receipts
- Role-based access control (admin/moderator)
- Rate limiting and abuse prevention
- End-to-end encryption
- Search over message history
- Push notifications
