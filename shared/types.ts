export type CardType =
  | 'exploding-kitten'
  | 'defuse'
  | 'nope'
  | 'attack'
  | 'skip'
  | 'favor'
  | 'shuffle'
  | 'see-the-future'
  | 'taco-cat'
  | 'cattermelon'
  | 'beard-cat'
  | 'rainbow-ralphing-cat'
  | 'hairy-potato-cat';

export type GamePhase = 'lobby' | 'playing' | 'finished';
export type PendingActionKind = 'nope' | 'favor-give' | 'defuse-reinsert';

export interface Card {
  id: string;
  type: CardType;
  title: string;
  image: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  eliminated: boolean;
  connected: boolean;
  host: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  handCount: number;
  eliminated: boolean;
  connected: boolean;
  host: boolean;
}

export interface LogEntry {
  id: string;
  text: string;
  at: number;
}

export interface PendingNopeAction {
  kind: 'nope';
  actorId: string;
  cardIds: string[];
  cards: Card[];
  action:
    | { type: 'attack'; turns: number }
    | { type: 'skip' }
    | { type: 'favor'; targetId: string }
    | { type: 'shuffle' }
    | { type: 'see-the-future' }
    | { type: 'combo-two'; targetId: string }
    | { type: 'combo-three'; targetId: string; namedType: CardType };
  nopePlayerIds: string[];
  nopeCount: number;
  expiresAt: number;
}

export interface TablePlay {
  actorId: string;
  actorName: string;
  cards: Card[];
  nopeCards: Card[];
  actionLabel: string;
}

export interface PendingFavorAction {
  kind: 'favor-give';
  requesterId: string;
  targetId: string;
}

export interface PendingDefuseAction {
  kind: 'defuse-reinsert';
  playerId: string;
  kitten: Card;
}

export type PendingAction = PendingNopeAction | PendingFavorAction | PendingDefuseAction;

export interface GameState {
  code: string;
  phase: GamePhase;
  players: Player[];
  deck: Card[];
  discard: Card[];
  currentPlayerId: string | null;
  direction: 1;
  turnDebt: number;
  pending: PendingAction | null;
  winnerId: string | null;
  log: LogEntry[];
  seeTheFutureByPlayer: Record<string, Card[]>;
  tablePlay: TablePlay | null;
}

export interface PublicGameState {
  code: string;
  phase: GamePhase;
  players: PublicPlayer[];
  deckCount: number;
  discardTop: Card | null;
  currentPlayerId: string | null;
  turnDebt: number;
  pending: PendingAction | null;
  tablePlay: TablePlay | null;
  winnerId: string | null;
  log: LogEntry[];
  me: {
    id: string;
    name: string;
    hand: Card[];
    eliminated: boolean;
    host: boolean;
    seeTheFuture: Card[];
  } | null;
}

export interface LobbySummary {
  code: string;
  playerId: string;
  reconnectToken: string;
}

export type ClientToServerEvents = {
  createLobby: (payload: { name: string }, ack: Ack<LobbySummary>) => void;
  joinLobby: (payload: { code: string; name: string }, ack: Ack<LobbySummary>) => void;
  reconnectLobby: (payload: { code: string; playerId: string; reconnectToken: string }, ack: Ack<LobbySummary>) => void;
  startGame: (ack: Ack<null>) => void;
  playCard: (payload: { cardId: string; targetId?: string }, ack: Ack<null>) => void;
  playCombo: (payload: { cardIds: string[]; targetId: string; namedType?: CardType }, ack: Ack<null>) => void;
  drawCard: (ack: Ack<null>) => void;
  playNope: (payload: { cardId: string }, ack: Ack<null>) => void;
  resolveNope: (ack: Ack<null>) => void;
  chooseFavorCard: (payload: { cardId: string }, ack: Ack<null>) => void;
  reinsertKitten: (payload: { position: number }, ack: Ack<null>) => void;
};

export type ServerToClientEvents = {
  state: (state: PublicGameState) => void;
  errorMessage: (message: string) => void;
};

export interface AckOk<T> {
  ok: true;
  data: T;
}

export interface AckErr {
  ok: false;
  error: string;
}

export type AckResult<T> = AckOk<T> | AckErr;
export type Ack<T> = (result: AckResult<T>) => void;
