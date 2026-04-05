# Virtual Cosmos

A realtime 2D multiplayer world where users move around, connect by proximity, chat, and use voice/video when nearby.

## Demo Scope

- Multiplayer movement in a shared world
- Proximity-based connection logic
- Direct and topic chat
- WebRTC media in proximity
- Moderation and admin tools

## Tech Stack

- Frontend: React, TypeScript, Vite, PixiJS, Zustand
- Backend: Node.js, Express, Socket.IO, Zod, Mongoose
- Database: MongoDB Atlas (optional but recommended)
- Monorepo: npm workspaces (`client`, `server`)

## Features

- Realtime multiplayer avatar movement
- WASD and Arrow-key controls
- Proximity radius connect/disconnect
- Direct chat (nearby users)
- Topic/room chat
- Voice/video calls for nearby users
- Presence states (active/idle) + media indicators
- Invite link per topic
- Moderation: block, report, profanity filtering, rate limiting
- Admin actions: mute, unmute, kick
- Admin metrics dashboard

## Project Structure

```text
.
├─ client/                 # React + Pixi frontend
├─ server/                 # Express + Socket.IO backend
├─ assignment.md
├─ package.json            # workspace scripts
└─ README.md
```

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 9+
- MongoDB Atlas connection string (optional)

## Environment Variables

Create `server/.env`:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=
MONGODB_DB=virtual_cosmos
ADMIN_KEY=
```

Create `client/.env`:

```env
VITE_SERVER_URL=http://localhost:4000
VITE_ADMIN_KEY=
```

Notes:

- If `MONGODB_URI` is empty, app runs without message persistence.
- Keep `ADMIN_KEY` same on client/server only if using admin dashboard.

## Install

```bash
npm install
```

## Run Locally

From repository root:

```bash
npm run dev
```

This runs both frontend and backend in parallel.

- Client: `http://localhost:5173`
- Server health: `http://localhost:4000/health`

## Build

```bash
npm run build
```

## Start Production Server

```bash
npm run start
```

## Usage Guide

1. Enter display name and join.
2. Move with `W/A/S/D` or Arrow keys.
3. Get close to users to connect chat/media.
4. Use topic chat in your current zone.
5. Copy invite link to share current topic.
6. Open admin mode with `?admin=1` and valid key.

## GitHub Deployment (Push)

1. Initialize git (if not already):

```bash
git init
```

2. Add remote:

```bash
git remote add origin <your-repo-url>
```

3. Check ignored files:

```bash
git status
```

4. Commit and push:

```bash
git add .
git commit -m "Initial project setup"
git branch -M main
git push -u origin main
```

## Important Safety Notes

- Never commit `.env` files or secrets.
- Never commit `node_modules`, build output, logs, or IDE cache.
- Use the provided `.gitignore` in repository root.

## Troubleshooting

- `EADDRINUSE` on server: the port is already occupied; stop existing process or change `PORT`.
- Client cannot connect: verify `VITE_SERVER_URL` and server is running.
- Media not working: allow mic/camera permissions in browser.

## License

ISC
