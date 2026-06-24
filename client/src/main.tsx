import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { Bomb, Copy, Crown, Eye, Hand, LogOut, Play, Timer, Users, Zap } from 'lucide-react';
import type { AckResult, Card, CardType, ClientToServerEvents, PublicGameState, ServerToClientEvents } from '../../shared/types';
import { CARD_INFO, CARD_TYPES } from '../../shared/cards';
import { AVATARS, DEFAULT_AVATAR_ID } from '../../shared/avatars';
import './styles.css';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socket: AppSocket = io();
const storedSession = () => ({
  code: localStorage.getItem('ek.code') ?? '',
  playerId: localStorage.getItem('ek.playerId') ?? '',
  reconnectToken: localStorage.getItem('ek.reconnectToken') ?? ''
});

function App() {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    socket.on('state', setState);
    socket.on('errorMessage', setError);
    const session = storedSession();
    if (session.code && session.playerId && session.reconnectToken) {
      socket.emit('reconnectLobby', session, (result) => {
        if (!result.ok) clearStoredSession();
      });
    }
    return () => {
      socket.off('state', setState);
      socket.off('errorMessage', setError);
    };
  }, []);

  const call = <T,>(event: keyof ClientToServerEvents, payload?: unknown) =>
    new Promise<AckResult<T>>((resolve) => {
      setBusy(true);
      const done = (result: AckResult<T>) => {
        setBusy(false);
        if (result.ok) setError('');
        else setError(result.error);
        resolve(result);
      };
      if (payload === undefined) {
        (socket.emit as any)(event, done);
      } else {
        (socket.emit as any)(event, payload, done);
      }
    });

  async function remember(result: AckResult<{ code: string; playerId: string; reconnectToken: string }>) {
    if (!result.ok) return;
    setError('');
    localStorage.setItem('ek.code', result.data.code);
    localStorage.setItem('ek.playerId', result.data.playerId);
    localStorage.setItem('ek.reconnectToken', result.data.reconnectToken);
  }

  async function leave() {
    const result = await call<null>('leaveLobby');
    if (!result.ok) return;
    clearStoredSession();
    setState(null);
    setError('');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Bomb size={22} />
          <span>BoomGato</span>
        </div>
        {state && (
          <div className="topbar-actions">
            <LobbyCode code={state.code} />
            <button className="leave-button" disabled={busy} onClick={leave}>
              <LogOut size={15} /> Leave lobby
            </button>
          </div>
        )}
      </header>

      {error && (
        <button className="toast" onClick={() => setError('')}>
          {error}
        </button>
      )}

      {!state && (
        <Entry
          busy={busy}
          create={(name, avatarId) => call<{ code: string; playerId: string; reconnectToken: string }>('createLobby', { name, avatarId }).then(remember)}
          join={(code, name, avatarId) => call<{ code: string; playerId: string; reconnectToken: string }>('joinLobby', { code, name, avatarId }).then(remember)}
          clearError={() => setError('')}
        />
      )}
      {state?.phase === 'lobby' && <Lobby state={state} busy={busy} start={() => call('startGame')} leave={leave} />}
      {state && state.phase !== 'lobby' && <Game state={state} busy={busy} call={call} leave={leave} />}
    </main>
  );
}

function Entry({
  busy,
  create,
  join,
  clearError
}: {
  busy: boolean;
  create: (name: string, avatarId: string) => void;
  join: (code: string, name: string, avatarId: string) => void;
  clearError: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  return (
    <section className="entry">
      <div className="entry-panel">
        <h1>Start a no-login table</h1>
        <p>Original Edition rules, in-memory lobbies, and nothing to set up beyond opening the page.</p>
        <label>
          Your name
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearError();
            }}
            placeholder="Player name"
            maxLength={24}
          />
        </label>
        <div className="avatar-picker" aria-label="Choose avatar">
          {AVATARS.map((avatar) => (
            <button
              className={`avatar-choice ${avatar.id === avatarId ? 'selected' : ''}`}
              type="button"
              title={avatar.label}
              onClick={() => {
                setAvatarId(avatar.id);
                clearError();
              }}
              key={avatar.id}
            >
              <Avatar avatarId={avatar.id} />
            </button>
          ))}
        </div>
        <div className="entry-actions">
          <button disabled={busy} onClick={() => create(name, avatarId)}>
            <Play size={16} /> Create lobby
          </button>
          <div className="join-row">
            <input
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                clearError();
              }}
              placeholder="CODE"
              maxLength={5}
            />
            <button disabled={busy} onClick={() => join(code, name, avatarId)}>
              Join
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Lobby({ state, busy, start, leave }: { state: PublicGameState; busy: boolean; start: () => void; leave: () => void }) {
  return (
    <section className="lobby">
      <div className="lobby-header">
        <div>
          <h1>Lobby {state.code}</h1>
          <p>{state.players.length} of 5 players. Start is available with 2 to 5 players.</p>
        </div>
        <button disabled={busy || !state.me?.host || state.players.length < 2} onClick={start}>
          <Play size={16} /> Start game
        </button>
        <button className="leave-button in-surface" disabled={busy} onClick={leave}>
          <LogOut size={15} /> Leave lobby
        </button>
      </div>
      <div className="players-grid">
        {state.players.map((player) => (
          <div className="player-tile" key={player.id}>
            <span><Avatar avatarId={player.avatarId} /> {player.name}</span>
            {player.host && <Crown size={16} />}
            <small>{player.connected ? 'connected' : 'reconnecting'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Game({
  state,
  busy,
  call,
  leave
}: {
  state: PublicGameState;
  busy: boolean;
  call: <T>(event: keyof ClientToServerEvents, payload?: unknown) => Promise<AckResult<T>>;
  leave: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [targetId, setTargetId] = useState('');
  const [namedType, setNamedType] = useState<CardType>('defuse');
  const me = state.me;
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  const isMyTurn = me?.id === state.currentPlayerId && !me.eliminated && !state.pending && state.phase === 'playing';
  const selectedCards = me?.hand.filter((card) => selected.includes(card.id)) ?? [];
  const liveTargets = state.players.filter((player) => !player.eliminated && player.id !== me?.id);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedKey = selected.join('|');
  const latestLog = state.log.at(-1);
  const [tableAlert, setTableAlert] = useState<{ text: string; tone: 'boom' | 'safe' | 'draw'; id: string } | null>(null);

  useEffect(() => setSelected([]), [state.currentPlayerId, state.pending?.kind]);
  useEffect(() => setTargetId(''), [selectedKey]);
  useEffect(() => {
    if (!latestLog) return;
    const lower = latestLog.text.toLowerCase();
    const tone = lower.includes('exploded') ? 'boom' : lower.includes('defused') ? 'safe' : lower.includes('drew a card') ? 'draw' : null;
    if (!tone) return;
    setTableAlert({ text: latestLog.text, tone, id: latestLog.id });
    const timer = window.setTimeout(() => setTableAlert((current) => (current?.id === latestLog.id ? null : current)), 2400);
    return () => window.clearTimeout(timer);
  }, [latestLog?.id]);

  function toggle(card: Card) {
    if (state.pending?.kind === 'favor-give' && state.pending.targetId === me?.id) {
      void call('chooseFavorCard', { cardId: card.id });
      return;
    }
    if (!canSelectCard(card, state, selectedCards)) return;
    setSelected((old) => (old.includes(card.id) ? old.filter((id) => id !== card.id) : [...old, card.id].slice(-3)));
  }

  async function playSelection() {
    if (!selectedCards.length) return;
    if (selectedCards.length === 1) {
      await call('playCard', { cardId: selectedCards[0]!.id, targetId: targetId || undefined });
    } else {
      await call('playCombo', { cardIds: selected, targetId, namedType });
    }
    setSelected([]);
  }

  return (
    <section className="game-layout">
      <aside className="left-rail">
        <h2><Users size={17} /> Players</h2>
        <button className="leave-button rail-leave" disabled={busy} onClick={leave}>
          <LogOut size={15} /> Leave lobby
        </button>
        {state.players.map((player) => (
          <div className={`player-row ${player.id === state.currentPlayerId ? 'active' : ''} ${player.eliminated ? 'out' : ''}`} key={player.id}>
            <span><Avatar avatarId={player.avatarId} /> {player.name}</span>
            <small>{player.eliminated ? 'spectator' : `${player.handCount} cards`}</small>
          </div>
        ))}
      </aside>

      <div className="table-zone">
        <div className="status-strip">
          <span>{state.phase === 'finished' ? `${state.players.find((p) => p.id === state.winnerId)?.name} wins` : `${current?.name ?? 'Nobody'} to play`}</span>
          <span>{state.turnDebt > 1 ? `${state.turnDebt} turns pending` : '1 turn'}</span>
          {me?.eliminated && <strong>Spectator mode</strong>}
        </div>

        <div className="table">
          <Pile title="Draw pile" count={state.deckCount} />
          {state.tablePlay && <TablePlay play={state.tablePlay} />}
          <div className="discard">
            <span>Discard</span>
            {state.discardTop ? <CardImage card={state.discardTop} /> : <div className="empty-card">empty</div>}
          </div>
          {state.pending?.kind === 'defuse-reinsert' && <TableAlert tone="boom" text="Exploding Kitten!" persistent />}
          {tableAlert && <TableAlert tone={tableAlert.tone} text={tableAlert.text} />}
        </div>

        {state.pending && <PendingPanel state={state} call={call} liveTargets={liveTargets} />}

        {state.phase === 'finished' && <RankingsPanel state={state} />}

        {Boolean(me?.seeTheFuture.length) && (
          <div className="peek-panel">
            <h3><Eye size={16} /> Top 3 cards</h3>
            <div className="mini-cards">{me!.seeTheFuture.map((card) => <CardImage key={card.id} card={card} />)}</div>
          </div>
        )}

        <div className="hand-zone">
          <div className="hand-header">
            <h2><Hand size={18} /> Your hand</h2>
            {isMyTurn && (
              <button className="end-turn-button" disabled={busy} onClick={() => call('drawCard')}>
                {state.turnDebt > 1 ? `Draw 1 of ${state.turnDebt} attack turns` : 'Draw card to end turn'}
              </button>
            )}
          </div>
          <SelectionHint state={state} selectedCards={selectedCards} />
          <ActionBar
            isMyTurn={Boolean(isMyTurn)}
            selectedCards={selectedCards}
            liveTargets={liveTargets}
            targetId={targetId}
            setTargetId={setTargetId}
            namedType={namedType}
            setNamedType={setNamedType}
            playSelection={playSelection}
            busy={busy}
          />
          <div className="hand-cards">
            {me?.hand.map((card) => (
              <CardButton
                card={card}
                selected={selectedSet.has(card.id)}
                selectable={canSelectCard(card, state, selectedCards)}
                mode={selectionModeLabel(card, state, selectedCards)}
                onClick={() => toggle(card)}
                key={card.id}
              />
            ))}
          </div>
        </div>
      </div>

      <aside className="right-rail">
        <h2>Activity</h2>
        <div className="log-list">
          {state.log.slice().reverse().map((entry) => (
            <p key={entry.id}>{entry.text}</p>
          ))}
        </div>
      </aside>
    </section>
  );
}

function CardButton({ card, selected, selectable, mode, onClick }: { card: Card; selected: boolean; selectable: boolean; mode: string; onClick: () => void }) {
  return (
    <button
      className={`card-button ${selected ? 'selected' : ''} ${!selectable ? 'blocked' : ''}`}
      disabled={!selectable}
      onClick={onClick}
      title={mode}
    >
      <CardImage card={card} />
      <span>{card.title}</span>
      {!selectable && <small>{mode}</small>}
    </button>
  );
}

function SelectionHint({ state, selectedCards }: { state: PublicGameState; selectedCards: Card[] }) {
  if (state.pending?.kind === 'favor-give' && state.pending.targetId === state.me?.id) {
    return <p className="selection-hint">Favor: choose exactly one card to give.</p>;
  }
  if (state.pending?.kind === 'nope') {
    return <p className="selection-hint">Pending action: only Nope cards can be played right now.</p>;
  }
  if (state.me?.id !== state.currentPlayerId || state.me.eliminated || state.phase !== 'playing') {
    return <p className="selection-hint">Waiting for your turn.</p>;
  }
  if (!selectedCards.length) {
    return <p className="selection-hint">Select one action card, or select two or three matching titles for a combo.</p>;
  }
  if (selectedCards.length === 1 && isSingleActionCard(selectedCards[0]!)) {
    return <p className="selection-hint">Play this action, or add matching titles to make a combo.</p>;
  }
  return <p className="selection-hint">Combo mode: only matching titles can be added.</p>;
}

function canSelectCard(card: Card, state: PublicGameState, selectedCards: Card[]): boolean {
  const me = state.me;
  if (!me || me.eliminated || state.phase !== 'playing') return false;
  const alreadySelected = selectedCards.some((item) => item.id === card.id);
  if (state.pending?.kind === 'favor-give') return state.pending.targetId === me.id;
  if (state.pending?.kind === 'nope') return state.pending.actorId !== me.id && card.type === 'nope';
  if (state.pending) return false;
  if (state.currentPlayerId !== me.id) return false;
  if (alreadySelected) return true;
  if (selectedCards.length >= 3) return false;
  if (selectedCards.length === 0) return card.type !== 'defuse' && card.type !== 'exploding-kitten' && card.type !== 'nope';
  const first = selectedCards[0]!;
  return card.type === first.type;
}

function selectionModeLabel(card: Card, state: PublicGameState, selectedCards: Card[]): string {
  if (canSelectCard(card, state, selectedCards)) return 'Selectable';
  const me = state.me;
  if (!me || me.eliminated) return 'Spectator';
  if (state.pending?.kind === 'favor-give') return state.pending.targetId === me.id ? 'Choose a card to give' : 'Waiting';
  if (state.pending?.kind === 'nope') return state.pending.actorId === me.id ? 'Your action' : 'Only Nope is valid';
  if (state.pending) return 'Action pending';
  if (state.currentPlayerId !== me.id) return 'Not your turn';
  if (card.type === 'defuse' || card.type === 'exploding-kitten' || card.type === 'nope') return 'Cannot start with this';
  if (selectedCards.length === 1 && card.type !== selectedCards[0]!.type) return 'Needs matching title';
  if (selectedCards.length > 0 && card.type !== selectedCards[0]!.type) return 'Needs matching title';
  if (selectedCards.length >= 3) return 'Maximum combo size';
  return 'Not selectable';
}

function isSingleActionCard(card: Card): boolean {
  return ['attack', 'skip', 'favor', 'shuffle', 'see-the-future'].includes(card.type);
}

function ActionBar(props: {
  isMyTurn: boolean;
  selectedCards: Card[];
  liveTargets: { id: string; name: string }[];
  targetId: string;
  setTargetId: (id: string) => void;
  namedType: CardType;
  setNamedType: (type: CardType) => void;
  playSelection: () => void;
  busy: boolean;
}) {
  const { selectedCards, liveTargets } = props;
  const needsTarget = selectedCards[0]?.type === 'favor' || selectedCards.length > 1;
  const comboOk = selectedCards.length <= 1 || selectedCards.every((card) => card.type === selectedCards[0]?.type);
  const playableSingle = selectedCards.length === 1 && isSingleActionCard(selectedCards[0]!);
  const canPlay = props.isMyTurn && comboOk && (playableSingle || selectedCards.length === 2 || selectedCards.length === 3) && (!needsTarget || Boolean(props.targetId));

  return (
    <div className="action-bar">
      {needsTarget && (
        <select value={props.targetId} onChange={(event) => props.setTargetId(event.target.value)}>
          <option value="">Choose target</option>
          {liveTargets.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
      )}
      {selectedCards.length === 3 && (
        <select value={props.namedType} onChange={(event) => props.setNamedType(event.target.value as CardType)}>
          {CARD_TYPES.map((type) => <option key={type} value={type}>{CARD_INFO[type].title}</option>)}
        </select>
      )}
      <button disabled={!canPlay || props.busy} onClick={props.playSelection}>
        Play selected
      </button>
    </div>
  );
}

function PendingPanel({ state, call }: { state: PublicGameState; liveTargets: { id: string; name: string }[]; call: <T>(event: keyof ClientToServerEvents, payload?: unknown) => Promise<AckResult<T>> }) {
  const pending = state.pending;
  const me = state.me;
  const [position, setPosition] = useState(0);
  if (!pending || !me) return null;
  if (pending.kind === 'nope') {
    const nope = me.hand.find((card) => card.type === 'nope');
    const canNope = Boolean(nope && !me.eliminated && pending.actorId !== me.id);
    return (
      <div className="pending-panel pending-nope">
        <strong><Timer size={16} /> Nope window</strong>
        <span>{pending.actorId === me.id ? 'Other players may stop this action.' : 'Play Nope now or let it resolve.'} Current count: {pending.nopeCount}</span>
        <NopeCountdown expiresAt={pending.expiresAt} />
        <div>
          {pending.actorId !== me.id && <button disabled={!canNope} onClick={() => nope && call('playNope', { cardId: nope.id })}>Play Nope</button>}
        </div>
      </div>
    );
  }
  if (pending.kind === 'favor-give' && pending.targetId === me.id) {
    return (
      <div className="pending-panel">
        <strong>Favor requested</strong>
        <span>Choose a card to give.</span>
      </div>
    );
  }
  if (pending.kind === 'defuse-reinsert' && pending.playerId === me.id) {
    const minPosition = state.deckCount > 0 ? 1 : 0;
    return (
      <div className="pending-panel">
        <strong>Defused</strong>
        <span>Choose where to put the Exploding Kitten back.</span>
        <input type="range" min={minPosition} max={state.deckCount} value={Math.max(position, minPosition)} onChange={(event) => setPosition(Number(event.target.value))} />
        <button onClick={() => call('reinsertKitten', { position: Math.max(position, minPosition) })}>Insert at position {Math.max(position, minPosition)}</button>
      </div>
    );
  }
  return <div className="pending-panel"><strong>Waiting</strong><span>Another player is resolving an action.</span></div>;
}

function NopeCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);
  const remaining = Math.max(0, expiresAt - now);
  const percent = Math.max(0, Math.min(100, (remaining / 8000) * 100));
  return (
    <div className="nope-countdown" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function TableAlert({ tone, text, persistent = false }: { tone: 'boom' | 'safe' | 'draw'; text: string; persistent?: boolean }) {
  return (
    <div className={`table-alert ${tone} ${persistent ? 'persistent' : ''}`}>
      {tone === 'boom' ? <Bomb size={24} /> : tone === 'safe' ? <Zap size={24} /> : <Hand size={24} />}
      <strong>{text}</strong>
    </div>
  );
}

function TablePlay({ play }: { play: NonNullable<PublicGameState['tablePlay']> }) {
  return (
    <div className={`table-play ${play.cards.length > 1 ? 'compact' : ''}`}>
      <span>{play.actorName} played</span>
      <div className="played-stack">
        {play.cards.map((card, index) => (
          <div className="played-card" style={{ '--i': index, '--count': play.cards.length } as React.CSSProperties} key={card.id}>
            <CardImage card={card} />
          </div>
        ))}
      </div>
      <strong>{play.actionLabel}</strong>
      {play.nopeCards.length > 0 && (
        <div className="nope-stack">
          <span>{play.nopeCards.length} Nope{play.nopeCards.length === 1 ? '' : 's'}</span>
          <div>
            {play.nopeCards.slice(-3).map((card) => (
              <CardImage card={card} key={card.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pile({ title, count }: { title: string; count: number }) {
  return (
    <div className="pile">
      <img src="/cards/draw-pile.svg" alt="" />
      <span>{title}</span>
      <strong>{count}</strong>
    </div>
  );
}

function RankingsPanel({ state }: { state: PublicGameState }) {
  return (
    <section className="rankings-panel">
      <h2>Final ranking</h2>
      <div className="rankings-list">
        {state.rankings.map((item) => (
          <div className={`rank-row ${item.status}`} key={item.playerId}>
            <strong>#{item.rank}</strong>
            <Avatar avatarId={item.avatarId} />
            <span>{item.name}</span>
            <small>{item.status === 'winner' ? 'Winner' : 'Eliminated'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Avatar({ avatarId }: { avatarId: string }) {
  return (
    <span className={`avatar avatar-${avatarId}`} aria-hidden="true">
      <span className="avatar-head" />
      <span className="avatar-hair" />
      <span className="avatar-eye left" />
      <span className="avatar-eye right" />
      <span className="avatar-body" />
      <span className="avatar-prop" />
    </span>
  );
}

function CardImage({ card }: { card: Card }) {
  const [src, setSrc] = useState(card.image);
  useEffect(() => setSrc(card.image), [card.image]);
  return (
    <img
      src={src}
      alt={card.title}
      onError={() => {
        if (!src.endsWith('.svg')) setSrc(`/cards/${card.type}.svg`);
      }}
    />
  );
}

function LobbyCode({ code }: { code: string }) {
  return (
    <button className="code-pill" onClick={() => navigator.clipboard?.writeText(code)}>
      <Copy size={15} /> {code}
    </button>
  );
}

function clearStoredSession() {
  localStorage.removeItem('ek.code');
  localStorage.removeItem('ek.playerId');
  localStorage.removeItem('ek.reconnectToken');
}

createRoot(document.getElementById('root')!).render(<App />);
