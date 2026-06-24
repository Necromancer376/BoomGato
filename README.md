# Exploding Kittens Web

A no-login, in-memory multiplayer web version of Exploding Kittens Original Edition. The server is authoritative, lobbies are temporary, and Socket.IO powers live play.

## Local Development

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173/`. The client proxies Socket.IO traffic to the local Node server on port `3001`.

## Production Build Locally

```bash
npm run build
npm start
```

Then open `http://localhost:3001/`.

Useful checks:

```bash
curl http://localhost:3001/health
npm test
```

## Deploy To Render

1. Push this project to a Git repository.
2. In Render, create a new Blueprint from the repo, or create a Web Service using the settings in `render.yaml`.
3. Render will run:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
4. No database or environment secrets are required.

Render provides the `PORT` environment variable automatically. Locally, the server falls back to port `3001`.

## Important Hosting Notes

- Lobbies, hands, reconnect tokens, and game state are stored only in memory.
- Restarting or sleeping the server clears all active lobbies.
- On Render's free plan, the service may sleep after inactivity. Active games need the service to remain awake.
