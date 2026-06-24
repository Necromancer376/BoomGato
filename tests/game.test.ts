import { describe, expect, it } from 'vitest';
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
  startGame
} from '../shared/game';
import type { CardType, GameState } from '../shared/types';

const noShuffle = <T>(items: T[]) => items;

function lobby(count: number): GameState {
  const state = createLobbyState('ABCDE', createPlayer('p1', 'Ada', true));
  for (let i = 2; i <= count; i += 1) addPlayer(state, createPlayer(`p${i}`, `P${i}`));
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
    expect(() => addPlayer(five, createPlayer('p6', 'P6'))).toThrow(/2 to 5/);
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
    resolveNope(state);
    expect(state.currentPlayerId).toBe('p2');
    expect(state.turnDebt).toBe(2);
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

  it('eliminates a player without a defuse and finishes when one remains', () => {
    const state = started(2);
    state.players[0]!.hand = state.players[0]!.hand.filter((card) => card.type !== 'defuse');
    state.deck.unshift(createCards(['exploding-kitten'])[0]!);
    drawCard(state, 'p1');
    expect(state.players[0]!.eliminated).toBe(true);
    expect(state.phase).toBe('finished');
    expect(state.winnerId).toBe('p2');
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
