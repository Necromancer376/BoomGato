import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import {
  addPlayer,
  chooseFavorCard,
  createLobbyState,
  createPlayer,
  drawCard,
  GameError,
  maybeAutoResolveNope,
  playCard,
  playCombo,
  playNope,
  reinsertKitten,
  resolveNope,
  startGame,
  toPublicState
} from '../shared/game.js';
import type { Ack, AckResult, ClientToServerEvents, GameState, LobbySummary, ServerToClientEvents } from '../shared/types.js';

interface Session {
  code: string;
  playerId: string;
  token: string;
}

interface LobbyRuntime {
  state: GameState;
  sessions: Map<string, string>;
}

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true }
});

const lobbies = new Map<string, LobbyRuntime>();
const socketSessions = new Map<string, Session>();

const clientDist = path.resolve(process.cwd(), 'dist');
const clientIndex = path.join(clientDist, 'index.html');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(clientDist));
app.get(/^\/(?!socket\.io).*/, (_req, res) => {
  if (!existsSync(clientIndex)) {
    res.status(503).send('Client build not found. Run npm run build before starting the production server.');
    return;
  }
  res.sendFile(clientIndex);
});

io.on('connection', (socket) => {
  socket.on('createLobby', (payload, ack) =>
    safeAck(ack, () => {
      const player = createPlayer(id(), payload.name, true);
      const code = uniqueLobbyCode();
      const state = createLobbyState(code, player);
      const token = id(24);
      lobbies.set(code, { state, sessions: new Map([[player.id, token]]) });
      attach(socket.id, code, player.id, token);
      socket.join(code);
      emitLobby(code);
      return { code, playerId: player.id, reconnectToken: token };
    })
  );

  socket.on('joinLobby', (payload, ack) =>
    safeAck(ack, () => {
      const code = payload.code.trim().toUpperCase();
      const lobby = requireLobby(code);
      const player = createPlayer(id(), payload.name);
      addPlayer(lobby.state, player);
      const token = id(24);
      lobby.sessions.set(player.id, token);
      attach(socket.id, code, player.id, token);
      socket.join(code);
      emitLobby(code);
      return { code, playerId: player.id, reconnectToken: token };
    })
  );

  socket.on('reconnectLobby', (payload, ack) =>
    safeAck(ack, () => {
      const code = payload.code.trim().toUpperCase();
      const lobby = requireLobby(code);
      const expected = lobby.sessions.get(payload.playerId);
      if (!expected || expected !== payload.reconnectToken) throw new GameError('Reconnect failed.');
      const player = lobby.state.players.find((item) => item.id === payload.playerId);
      if (!player) throw new GameError('Player not found.');
      player.connected = true;
      attach(socket.id, code, player.id, expected);
      socket.join(code);
      emitLobby(code);
      return { code, playerId: player.id, reconnectToken: expected };
    })
  );

  socket.on('startGame', (ack) => mutate(socket.id, ack, (state, playerId) => startGame(state, playerId)));
  socket.on('playCard', (payload, ack) => mutate(socket.id, ack, (state, playerId) => playCard(state, playerId, payload.cardId, payload.targetId)));
  socket.on('playCombo', (payload, ack) =>
    mutate(socket.id, ack, (state, playerId) => playCombo(state, playerId, payload.cardIds, payload.targetId, payload.namedType))
  );
  socket.on('drawCard', (ack) => mutate(socket.id, ack, (state, playerId) => drawCard(state, playerId)));
  socket.on('playNope', (payload, ack) => mutate(socket.id, ack, (state, playerId) => playNope(state, playerId, payload.cardId)));
  socket.on('resolveNope', (ack) =>
    mutate(socket.id, ack, (state, playerId) => {
      if (state.pending?.kind === 'nope' && state.pending.actorId !== playerId) throw new GameError('Only the acting player can resolve this early.');
      resolveNope(state);
    })
  );
  socket.on('chooseFavorCard', (payload, ack) => mutate(socket.id, ack, (state, playerId) => chooseFavorCard(state, playerId, payload.cardId)));
  socket.on('reinsertKitten', (payload, ack) => mutate(socket.id, ack, (state, playerId) => reinsertKitten(state, playerId, payload.position)));

  socket.on('disconnect', () => {
    const session = socketSessions.get(socket.id);
    if (!session) return;
    socketSessions.delete(socket.id);
    const lobby = lobbies.get(session.code);
    const player = lobby?.state.players.find((item) => item.id === session.playerId);
    if (player) player.connected = false;
    if (lobby) emitLobby(session.code);
  });
});

setInterval(() => {
  for (const [code, lobby] of lobbies) {
    if (maybeAutoResolveNope(lobby.state)) emitLobby(code);
  }
}, 500);

const port = Number(process.env.PORT ?? 3001);
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing dev server or run with PORT=<free-port> npm run dev:server.`);
    process.exit(1);
  }
  throw error;
});

httpServer.listen(port, () => {
  console.log(`Exploding Kittens server listening on http://localhost:${port}`);
});

function mutate( socketId: string, ack: Ack<null>, action: (state: GameState, playerId: string) => void): void {
  safeAck(ack, () => {
    const session = socketSessions.get(socketId);
    if (!session) throw new GameError('Join a lobby first.');
    const lobby = requireLobby(session.code);
    action(lobby.state, session.playerId);
    emitLobby(session.code);
    return null;
  });
}

function safeAck<T>(ack: Ack<T>, action: () => T): void {
  try {
    ack({ ok: true, data: action() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    ack({ ok: false, error: message } satisfies AckResult<T>);
  }
}

function emitLobby(code: string): void {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  const room = io.sockets.adapter.rooms.get(code);
  for (const socketId of room ?? []) {
    const playerId = socketSessions.get(socketId)?.playerId ?? null;
    io.to(socketId).emit('state', toPublicState(lobby.state, playerId));
  }
}

function requireLobby(code: string): LobbyRuntime {
  const lobby = lobbies.get(code);
  if (!lobby) throw new GameError('Lobby not found.');
  return lobby;
}

function attach(socketId: string, code: string, playerId: string, token: string): void {
  socketSessions.set(socketId, { code, playerId, token });
}

function uniqueLobbyCode(): string {
  let code = '';
  do {
    code = id(5).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(5, 'X').slice(0, 5);
  } while (lobbies.has(code));
  return code;
}

function id(length = 10): string {
  return Math.random().toString(36).slice(2, 2 + length);
}
