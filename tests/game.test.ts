import { describe, expect, it } from 'vitest';
import { AVATARS } from '../shared/avatars';
import { createCards } from '../shared/cards';
import {
  addPlayer,
  chooseFavorCard,
  createLobbyState,
  createPlayer,
  drawCard,
  playCard,
  playCombo,
  playNope,
  reinsertKitten,
  resolveNope,
  startGame,
  toPublicState
} from '../shared/game';
import type { CardType, GameState } from '../shared/types';

const noShuffle = <T>(items: T[]) => items;

function lobby(count: number): GameState {
  const state = createLobbyState('ABCDE', createPlayer('p1', 'Ada', true, AVATARS[0]!.id));
  for (let i = 2; i <= count; i += 1) addPlayer(state, createPlayer(`p${i}`, `P${i}`, false, AVATARS[i - 1]!.id));
  return state;
}

function started(count = 3): GameState {
  const state = lobby(count);
  startGame(state, 'p1', noShuffle);
  return state;
}

function give(state: GameState, playerId: string, types: CardType[]) {
  const player = state.players.find((item) => item.id === playerId)!;
  player.hand.push(...createCards(types).map((card, index) => ({ ...card, id: `${playerId}-${card.type}-${index}-${Math.random()}` })));
}

describe('setup', () => {
  it.each([2, 3, 4, 5])('deals legal original edition setup for %i players', (count) => {
    const state = started(count);
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(count);
    expect(state.players.every((player) => player.hand.length === 8)).toBe(true);
    expect(state.deck.filter((card) => card.type === 'exploding-kitten')).toHaveLength(count - 1);
    expect(state.deck.filter((card) => card.type === 'defuse')).toHaveLength(count <= 3 ? 2 : 6 - count);
  });

  it('requires 2 to 5 players', () => {
    const one = lobby(1);
    expect(() => startGame(one, 'p1')).toThrow(/2 to 5/);
    const five = lobby(5);
    expect(() => addPlayer(five, createPlayer('p6', 'P6', false, AVATARS[5]!.id))).toThrow(/2 to 5/);
  });

  it('rejects duplicate avatars in a lobby', () => {
    const state = createLobbyState('ABCDE', createPlayer('p1', 'Ada', true, AVATARS[0]!.id));
    expect(() => addPlayer(state, createPlayer('p2', 'Ben', false, AVATARS[0]!.id))).toThrow(/avatar/);
  });

  it('allows the same avatar in different lobbies', () => {
    const a = createLobbyState('AAAAA', createPlayer('p1', 'Ada', true, AVATARS[0]!.id));
    const b = createLobbyState('BBBBB', createPlayer('p2', 'Ben', true, AVATARS[0]!.id));
    expect(a.players[0]!.avatarId).toBe(b.players[0]!.avatarId);
  });
});

describe('turn validation and effects', () => {
  it('prevents non-active and eliminated players from playing', () => {
    const state = started(2);
    give(state, 'p2', ['skip']);
    expect(() => playCard(state, 'p2', state.players[1]!.hand.at(-1)!.id)).toThrow(/not your turn/);
    state.players[0]!.eliminated = true;
    expect(() => playCard(state, 'p1', state.players[0]!.hand[0]!.id)).toThrow(/Spectators/);
  });

  it('applies skip as one completed turn', () => {
    const state = started(2);
    give(state, 'p1', ['skip']);
    const skip = state.players[0]!.hand.find((card) => card.type === 'skip')!;
    playCard(state, 'p1', skip.id);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p2');
  });

  it('applies attack as two turns for the next player', () => {
    const state = started(2);
    give(state, 'p1', ['attack']);
    const attack = state.players[0]!.hand.find((card) => card.type === 'attack')!;
    playCard(state, 'p1', attack.id);
    expect(state.currentPlayerId).toBe('p2');
    expect(state.turnDebt).toBe(1);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p2');
    expect(state.turnDebt).toBe(2);
  });

  it('keeps played cards visible while the Nope window is open', () => {
    const state = started(2);
    give(state, 'p1', ['skip', 'skip']);
    const pair = state.players[0]!.hand.filter((card) => card.type === 'skip').slice(-2);
    playCombo(state, 'p1', pair.map((card) => card.id), 'p2');
    expect(state.tablePlay?.cards.map((card) => card.type)).toEqual(['skip', 'skip']);
    expect(state.tablePlay?.actionLabel).toBe('Two of a kind');
    resolveNope(state);
    expect(state.tablePlay).toBeNull();
  });

  it('skips only one pending attack turn', () => {
    const state = started(3);
    state.currentPlayerId = 'p2';
    state.turnDebt = 2;
    give(state, 'p2', ['skip']);
    const skip = state.players[1]!.hand.find((card) => card.type === 'skip')!;
    playCard(state, 'p2', skip.id);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p2');
    expect(state.turnDebt).toBe(1);
  });

  it('does not return a Noped Attack to the attacker', () => {
    const state = started(2);
    give(state, 'p1', ['attack']);
    give(state, 'p2', ['nope']);
    const attack = state.players[0]!.hand.find((card) => card.type === 'attack')!;
    playCard(state, 'p1', attack.id);
    const nope = state.players[1]!.hand.find((card) => card.type === 'nope')!;
    playNope(state, 'p2', nope.id);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p2');
    expect(state.turnDebt).toBe(1);
  });

  it('stacks attacks by transferring current debt plus two turns', () => {
    const state = started(3);
    state.currentPlayerId = 'p2';
    state.turnDebt = 2;
    give(state, 'p2', ['attack']);
    const attack = state.players[1]!.hand.find((card) => card.type === 'attack')!;
    playCard(state, 'p2', attack.id);
    expect(state.currentPlayerId).toBe('p3');
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p3');
    expect(state.turnDebt).toBe(4);
  });

  it('prevents the actor from Noping their own action', () => {
    const state = started(2);
    give(state, 'p1', ['skip', 'nope']);
    const skip = state.players[0]!.hand.find((card) => card.type === 'skip')!;
    const nope = state.players[0]!.hand.find((card) => card.type === 'nope')!;
    playCard(state, 'p1', skip.id);
    expect(() => playNope(state, 'p1', nope.id)).toThrow(/own action/);
  });

  it('allows another living player to Nope and cancel an action', () => {
    const state = started(2);
    give(state, 'p1', ['skip']);
    give(state, 'p2', ['nope']);
    const skip = state.players[0]!.hand.find((card) => card.type === 'skip')!;
    const nope = state.players[1]!.hand.find((card) => card.type === 'nope')!;
    playCard(state, 'p1', skip.id);
    playNope(state, 'p2', nope.id);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p1');
  });

  it('keeps the active player after resolving non-ending actions', () => {
    const state = started(2);
    give(state, 'p1', ['shuffle', 'see-the-future', 'favor', 'skip', 'skip']);
    const shuffle = state.players[0]!.hand.find((card) => card.type === 'shuffle')!;
    playCard(state, 'p1', shuffle.id);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p1');

    const future = state.players[0]!.hand.find((card) => card.type === 'see-the-future')!;
    playCard(state, 'p1', future.id);
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p1');

    const pair = state.players[0]!.hand.filter((card) => card.type === 'skip').slice(-2);
    playCombo(state, 'p1', pair.map((card) => card.id), 'p2');
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p1');
  });

  it('defuses an exploding kitten and reinserts it', () => {
    const state = started(2);
    state.deck.unshift(createCards(['exploding-kitten'])[0]!);
    drawCard(state, 'p1');
    expect(state.pending?.kind).toBe('defuse-reinsert');
    reinsertKitten(state, 'p1', 1);
    expect(state.pending).toBeNull();
    expect(state.deck[1]?.type).toBe('exploding-kitten');
    expect(state.currentPlayerId).toBe('p2');
  });

  it('rejects placing a defused kitten on top when the deck has cards', () => {
    const state = started(2);
    state.deck.unshift(createCards(['exploding-kitten'])[0]!);
    drawCard(state, 'p1');
    expect(() => reinsertKitten(state, 'p1', 0)).toThrow(/below the top/);
  });

  it('allows placing a defused kitten at position zero when the deck is empty', () => {
    const state = started(2);
    state.deck = [createCards(['exploding-kitten'])[0]!];
    drawCard(state, 'p1');
    reinsertKitten(state, 'p1', 0);
    expect(state.deck[0]?.type).toBe('exploding-kitten');
  });

  it('eliminates a player without a defuse and finishes when one remains', () => {
    const state = started(2);
    state.players[0]!.hand = state.players[0]!.hand.filter((card) => card.type !== 'defuse');
    state.deck.unshift(createCards(['exploding-kitten'])[0]!);
    drawCard(state, 'p1');
    expect(state.players[0]!.eliminated).toBe(true);
    expect(state.phase).toBe('finished');
    expect(state.winnerId).toBe('p2');
  });

  it('reports final rankings with winner first and eliminated players after', () => {
    const state = started(3);
    state.players[0]!.hand = state.players[0]!.hand.filter((card) => card.type !== 'defuse');
    state.deck.unshift(createCards(['exploding-kitten'])[0]!);
    drawCard(state, 'p1');
    state.players[1]!.hand = state.players[1]!.hand.filter((card) => card.type !== 'defuse');
    state.deck.unshift(createCards(['exploding-kitten'])[0]!);
    drawCard(state, 'p2');
    const publicState = toPublicState(state, 'p3');
    expect(publicState.rankings.map((rank) => rank.name)).toEqual(['P3', 'P2', 'Ada']);
    expect(publicState.rankings.map((rank) => rank.rank)).toEqual([1, 2, 3]);
  });

  it('handles favor card choice', () => {
    const state = started(2);
    give(state, 'p1', ['favor']);
    const favor = state.players[0]!.hand.find((card) => card.type === 'favor')!;
    const targetCard = state.players[1]!.hand[0]!;
    playCard(state, 'p1', favor.id, 'p2');
    resolveNope(state);
    chooseFavorCard(state, 'p2', targetCard.id);
    expect(state.players[0]!.hand.some((card) => card.id === targetCard.id)).toBe(true);
  });

  it('does not remove Favor when target validation fails', () => {
    const state = started(2);
    state.players[1]!.hand = [];
    give(state, 'p1', ['favor']);
    const favor = state.players[0]!.hand.find((card) => card.type === 'favor')!;
    expect(() => playCard(state, 'p1', favor.id, 'p2')).toThrow(/no cards/);
    expect(state.players[0]!.hand.some((card) => card.id === favor.id)).toBe(true);
  });
});

describe('combos', () => {
  it('steals a random card with two of a kind', () => {
    const state = started(2);
    give(state, 'p1', ['skip', 'skip']);
    const pair = state.players[0]!.hand.filter((card) => card.type === 'skip').slice(-2);
    const before = state.players[1]!.hand.length;
    playCombo(state, 'p1', pair.map((card) => card.id), 'p2');
    resolveNope(state);
    expect(state.players[1]!.hand.length).toBe(before - 1);
  });

  it('takes a named card with three of a kind when target has it', () => {
    const state = started(2);
    give(state, 'p1', ['skip', 'skip', 'skip']);
    give(state, 'p2', ['attack']);
    const trio = state.players[0]!.hand.filter((card) => card.type === 'skip').slice(-3);
    playCombo(state, 'p1', trio.map((card) => card.id), 'p2', 'attack');
    resolveNope(state);
    expect(state.players[0]!.hand.some((card) => card.type === 'attack')).toBe(true);
  });
});
