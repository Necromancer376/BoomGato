import { CARD_INFO, createCards } from './cards.js';
import type { Card, CardType, GameState, LogEntry, PendingNopeAction, Player, PublicGameState } from './types.js';

const NOPE_WINDOW_MS = 8000;

export class GameError extends Error {}

export function createLobbyState(code: string, host: Player): GameState {
  return {
    code,
    phase: 'lobby',
    players: [host],
    deck: [],
    discard: [],
    currentPlayerId: null,
    direction: 1,
    turnDebt: 0,
    pending: null,
    winnerId: null,
    log: [log(`${host.name} created the lobby.`)],
    seeTheFutureByPlayer: {}
  };
}

export function createPlayer(id: string, name: string, host = false): Player {
  return {
    id,
    name: cleanName(name),
    hand: [],
    eliminated: false,
    connected: true,
    host
  };
}

export function cleanName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!cleaned) throw new GameError('Enter a name first.');
  return cleaned;
}

export function addPlayer(state: GameState, player: Player): void {
  if (state.phase !== 'lobby') throw new GameError('This game has already started.');
  if (state.players.length >= 5) throw new GameError('Original Edition supports 2 to 5 players.');
  if (state.players.some((p) => p.name.toLowerCase() === player.name.toLowerCase())) {
    throw new GameError('That name is already in this lobby.');
  }
  state.players.push(player);
  addLog(state, `${player.name} joined the lobby.`);
}

export function startGame(state: GameState, hostId: string, shuffleFn = shuffle): void {
  if (state.phase !== 'lobby') throw new GameError('The game has already started.');
  if (state.players[0]?.id !== hostId) throw new GameError('Only the lobby creator can start the game.');
  if (state.players.length < 2 || state.players.length > 5) throw new GameError('Start requires 2 to 5 players.');

  state.phase = 'playing';
  state.discard = [];
  state.pending = null;
  state.turnDebt = 1;
  state.winnerId = null;
  state.seeTheFutureByPlayer = {};
  for (const player of state.players) {
    player.eliminated = false;
    player.hand = [];
  }

  const nonSpecialTypes: CardType[] = [];
  for (const [type, info] of Object.entries(CARD_INFO) as [CardType, (typeof CARD_INFO)[CardType]][]) {
    if (type === 'exploding-kitten' || type === 'defuse') continue;
    for (let i = 0; i < info.count; i += 1) nonSpecialTypes.push(type);
  }

  const drawPool = shuffleFn(createCards(nonSpecialTypes));
  const defuses = createCards(Array.from({ length: CARD_INFO.defuse.count }, () => 'defuse'));
  const kittens = createCards(Array.from({ length: CARD_INFO['exploding-kitten'].count }, () => 'exploding-kitten'));

  for (const player of state.players) {
    player.hand.push(defuses.pop()!);
    for (let i = 0; i < 7; i += 1) {
      const card = drawPool.pop();
      if (!card) throw new GameError('Not enough cards to deal.');
      player.hand.push(card);
    }
    player.hand = sortHand(player.hand);
  }

  const extraDefuseCount = state.players.length <= 3 ? 2 : defuses.length;
  const extras = defuses.slice(0, extraDefuseCount);
  const activeKittens = kittens.slice(0, state.players.length - 1);
  state.deck = shuffleFn([...drawPool, ...extras, ...activeKittens]);
  state.currentPlayerId = state.players[0]!.id;
  addLog(state, `${state.players[0]!.name} starts the game.`);
}

export function playCard(state: GameState, playerId: string, cardId: string, targetId?: string): void {
  assertActiveTurn(state, playerId);
  const player = getPlayer(state, playerId);
  const card = player.hand.find((item) => item.id === cardId);
  if (!card) throw new GameError('Card is not in your hand.');
  if (card.type === 'defuse' || card.type === 'exploding-kitten') throw new GameError(`${card.title} cannot be played now.`);
  if (card.type === 'nope') throw new GameError('Nope can only be played against a pending action.');
  const action = actionFromCard(state, playerId, card, targetId);
  if (action.type === 'favor' && getPlayer(state, action.targetId).hand.length === 0) throw new GameError('That player has no cards.');
  createNopeWindow(state, playerId, [takeCard(player, cardId)], action);
}

export function playCombo(state: GameState, playerId: string, cardIds: string[], targetId: string, namedType?: CardType): void {
  assertActiveTurn(state, playerId);
  if (cardIds.length !== 2 && cardIds.length !== 3) throw new GameError('Combos require two or three matching cards.');
  const player = getPlayer(state, playerId);
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (cards.some((card) => !card)) throw new GameError('One or more combo cards are not in your hand.');
  const firstType = cards[0]!.type;
  if (!cards.every((card) => card!.type === firstType)) throw new GameError('Combo cards must have the same title.');
  const target = getLivingTarget(state, targetId, playerId);
  const removed = cardIds.map((id) => takeCard(player, id));
  createNopeWindow(
    state,
    playerId,
    removed,
    cardIds.length === 2 ? { type: 'combo-two', targetId: target.id } : { type: 'combo-three', targetId: target.id, namedType: namedType ?? firstType }
  );
}

export function playNope(state: GameState, playerId: string, cardId: string): void {
  if (state.phase !== 'playing') throw new GameError('The game is not active.');
  if (state.pending?.kind !== 'nope') throw new GameError('There is nothing to Nope.');
  if (state.pending.actorId === playerId) throw new GameError('You cannot Nope your own action.');
  const player = getPlayer(state, playerId);
  if (player.eliminated) throw new GameError('Spectators cannot play Nope.');
  const card = takeCard(player, cardId);
  if (card.type !== 'nope') throw new GameError('That is not a Nope card.');
  state.pending.nopeCount += 1;
  state.pending.nopePlayerIds.push(playerId);
  state.pending.expiresAt = Date.now() + NOPE_WINDOW_MS;
  state.discard.push(card);
  addLog(state, `${player.name} played Nope.`);
}

export function resolveNope(state: GameState): void {
  if (state.pending?.kind !== 'nope') throw new GameError('There is no pending action.');
  const pending = state.pending;
  state.pending = null;
  const actor = getPlayer(state, pending.actorId);
  if (pending.nopeCount % 2 === 1) {
    state.discard.push(...pending.cards);
    addLog(state, `${actor.name}'s action was Noped.`);
    return;
  }
  applyAction(state, pending);
}

export function drawCard(state: GameState, playerId: string): void {
  assertActiveTurn(state, playerId);
  state.seeTheFutureByPlayer[playerId] = [];
  const player = getPlayer(state, playerId);
  const card = state.deck.shift();
  if (!card) throw new GameError('The draw pile is empty.');
  if (card.type === 'exploding-kitten') {
    const defuse = player.hand.find((item) => item.type === 'defuse');
    if (!defuse) {
      player.eliminated = true;
      state.discard.push(card, ...player.hand);
      player.hand = [];
      addLog(state, `${player.name} exploded and is now spectating.`);
      finishTurnAfterDraw(state);
      checkWinner(state);
      return;
    }
    takeCard(player, defuse.id);
    state.discard.push(defuse);
    state.pending = { kind: 'defuse-reinsert', playerId, kitten: card };
    addLog(state, `${player.name} defused an Exploding Kitten.`);
    return;
  }
  player.hand.push(card);
  player.hand = sortHand(player.hand);
  addLog(state, `${player.name} drew a card.`);
  finishTurnAfterDraw(state);
}

export function reinsertKitten(state: GameState, playerId: string, position: number): void {
  if (state.pending?.kind !== 'defuse-reinsert' || state.pending.playerId !== playerId) {
    throw new GameError('You do not have a kitten to reinsert.');
  }
  const index = clamp(Math.floor(position), 0, state.deck.length);
  state.deck.splice(index, 0, state.pending.kitten);
  state.pending = null;
  addLog(state, `${getPlayer(state, playerId).name} put the kitten back into the draw pile.`);
  finishTurnAfterDraw(state);
}

export function chooseFavorCard(state: GameState, playerId: string, cardId: string): void {
  if (state.pending?.kind !== 'favor-give' || state.pending.targetId !== playerId) {
    throw new GameError('No Favor is waiting on you.');
  }
  const target = getPlayer(state, playerId);
  const requester = getPlayer(state, state.pending.requesterId);
  const card = takeCard(target, cardId);
  requester.hand.push(card);
  requester.hand = sortHand(requester.hand);
  state.pending = null;
  addLog(state, `${target.name} gave ${requester.name} a card.`);
}

export function toPublicState(state: GameState, playerId: string | null): PublicGameState {
  const me = playerId ? state.players.find((player) => player.id === playerId) : null;
  return {
    code: state.code,
    phase: state.phase,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      eliminated: player.eliminated,
      connected: player.connected,
      host: player.host
    })),
    deckCount: state.deck.length,
    discardTop: state.discard.at(-1) ?? null,
    currentPlayerId: state.currentPlayerId,
    turnDebt: state.turnDebt,
    pending: state.pending,
    winnerId: state.winnerId,
    log: state.log.slice(-80),
    me: me
      ? {
          id: me.id,
          name: me.name,
          hand: me.hand,
          eliminated: me.eliminated,
          host: me.host,
          seeTheFuture: state.seeTheFutureByPlayer[me.id] ?? []
        }
      : null
  };
}

export function maybeAutoResolveNope(state: GameState): boolean {
  if (state.pending?.kind === 'nope' && state.pending.expiresAt <= Date.now()) {
    resolveNope(state);
    return true;
  }
  return false;
}

function actionFromCard(state: GameState, actorId: string, card: Card, targetId?: string): PendingNopeAction['action'] {
  if (card.type === 'attack') return { type: 'attack' };
  if (card.type === 'skip') return { type: 'skip' };
  if (card.type === 'favor') return { type: 'favor', targetId: getLivingTarget(state, targetId ?? '', actorId).id };
  if (card.type === 'shuffle') return { type: 'shuffle' };
  if (card.type === 'see-the-future') return { type: 'see-the-future' };
  throw new GameError(`${card.title} cannot be played alone.`);
}

function createNopeWindow(state: GameState, actorId: string, cards: Card[], action: PendingNopeAction['action']): void {
  if (action.type === 'favor' && !action.targetId) throw new GameError('Choose a player for Favor.');
  state.pending = {
    kind: 'nope',
    actorId,
    cardIds: cards.map((card) => card.id),
    cards,
    action,
    nopePlayerIds: [],
    nopeCount: 0,
    expiresAt: Date.now() + NOPE_WINDOW_MS
  };
  addLog(state, `${getPlayer(state, actorId).name} played ${cards.map((card) => card.title).join(' + ')}.`);
}

function applyAction(state: GameState, pending: PendingNopeAction): void {
  const actor = getPlayer(state, pending.actorId);
  state.discard.push(...pending.cards);
  switch (pending.action.type) {
    case 'attack':
      addLog(state, `${actor.name} attacked the next player.`);
      state.turnDebt = Math.max(0, state.turnDebt - 1) + 2;
      advanceToNextPlayer(state);
      break;
    case 'skip':
      addLog(state, `${actor.name} skipped a draw.`);
      consumeTurnAndMaybeAdvance(state);
      break;
    case 'shuffle':
      state.deck = shuffle(state.deck);
      addLog(state, `${actor.name} shuffled the draw pile.`);
      break;
    case 'see-the-future':
      state.seeTheFutureByPlayer[pending.actorId] = state.deck.slice(0, 3);
      addLog(state, `${actor.name} peeked at the future.`);
      break;
    case 'favor': {
      const target = getLivingTarget(state, pending.action.targetId, pending.actorId);
      if (target.hand.length === 0) throw new GameError('That player has no cards.');
      state.pending = { kind: 'favor-give', requesterId: pending.actorId, targetId: target.id };
      addLog(state, `${actor.name} asked ${target.name} for a Favor.`);
      break;
    }
    case 'combo-two': {
      const target = getLivingTarget(state, pending.action.targetId, pending.actorId);
      if (target.hand.length === 0) throw new GameError('That player has no cards.');
      const index = Math.floor(Math.random() * target.hand.length);
      const [card] = target.hand.splice(index, 1);
      actor.hand.push(card!);
      actor.hand = sortHand(actor.hand);
      addLog(state, `${actor.name} stole a random card from ${target.name}.`);
      break;
    }
    case 'combo-three': {
      const { targetId, namedType } = pending.action;
      const target = getLivingTarget(state, targetId, pending.actorId);
      const index = target.hand.findIndex((card) => card.type === namedType);
      if (index >= 0) {
        const [card] = target.hand.splice(index, 1);
        actor.hand.push(card!);
        actor.hand = sortHand(actor.hand);
        addLog(state, `${actor.name} took ${card!.title} from ${target.name}.`);
      } else {
        addLog(state, `${target.name} did not have the named card.`);
      }
      break;
    }
  }
}

function finishTurnAfterDraw(state: GameState): void {
  consumeTurnAndMaybeAdvance(state);
}

function consumeTurnAndMaybeAdvance(state: GameState): void {
  state.turnDebt = Math.max(0, state.turnDebt - 1);
  if (state.turnDebt === 0) {
    state.turnDebt = 1;
    advanceToNextPlayer(state);
  }
}

function advanceToNextPlayer(state: GameState): void {
  if (!state.currentPlayerId) return;
  const living = state.players.filter((player) => !player.eliminated);
  if (living.length <= 1) {
    checkWinner(state);
    return;
  }
  let index = state.players.findIndex((player) => player.id === state.currentPlayerId);
  for (let i = 0; i < state.players.length; i += 1) {
    index = (index + state.direction + state.players.length) % state.players.length;
    const next = state.players[index]!;
    if (!next.eliminated) {
      state.currentPlayerId = next.id;
      addLog(state, `${next.name}'s turn.`);
      return;
    }
  }
}

function checkWinner(state: GameState): void {
  const living = state.players.filter((player) => !player.eliminated);
  if (living.length === 1) {
    state.phase = 'finished';
    state.winnerId = living[0]!.id;
    state.currentPlayerId = null;
    state.pending = null;
    addLog(state, `${living[0]!.name} wins!`);
  }
}

function assertActiveTurn(state: GameState, playerId: string): void {
  if (state.phase !== 'playing') throw new GameError('The game is not active.');
  if (state.pending) throw new GameError('Resolve the pending action first.');
  const player = getPlayer(state, playerId);
  if (player.eliminated) throw new GameError('Spectators cannot play.');
  if (state.currentPlayerId !== playerId) throw new GameError('It is not your turn.');
}

function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new GameError('Player not found.');
  return player;
}

function getLivingTarget(state: GameState, targetId: string, actorId: string): Player {
  const target = getPlayer(state, targetId);
  if (target.id === actorId) throw new GameError('Choose another player.');
  if (target.eliminated) throw new GameError('That player is spectating.');
  return target;
}

function takeCard(player: Player, cardId: string): Card {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index < 0) throw new GameError('Card is not in your hand.');
  const [card] = player.hand.splice(index, 1);
  return card!;
}

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => a.title.localeCompare(b.title));
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function log(text: string): LogEntry {
  return { id: cryptoId(), text, at: Date.now() };
}

function addLog(state: GameState, text: string): void {
  state.log.push(log(text));
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
