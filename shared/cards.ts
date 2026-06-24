import type { Card, CardType } from './types.js';

export const CARD_INFO: Record<CardType, { title: string; count: number; image: string; cat?: boolean }> = {
  'exploding-kitten': { title: 'Exploding Kitten', count: 4, image: '/cards/exploding-kitten.jpg' },
  defuse: { title: 'Defuse', count: 6, image: '/cards/defuse.jpg' },
  nope: { title: 'Nope', count: 5, image: '/cards/nope.jpg' },
  attack: { title: 'Attack', count: 4, image: '/cards/attack.jpg' },
  skip: { title: 'Skip', count: 4, image: '/cards/skip.jpg' },
  favor: { title: 'Favor', count: 4, image: '/cards/favor.jpg' },
  shuffle: { title: 'Shuffle', count: 4, image: '/cards/shuffle.jpg' },
  'see-the-future': { title: 'See the Future', count: 5, image: '/cards/see-the-future.jpg' },
  'taco-cat': { title: 'Taco Cat', count: 4, image: '/cards/taco-cat.jpg', cat: true },
  cattermelon: { title: 'Cattermelon', count: 4, image: '/cards/cattermelon.jpg', cat: true },
  'beard-cat': { title: 'Beard Cat', count: 4, image: '/cards/beard-cat.jpg', cat: true },
  'rainbow-ralphing-cat': { title: 'Rainbow Ralphing Cat', count: 4, image: '/cards/rainbow-ralphing-cat.jpg', cat: true },
  'hairy-potato-cat': { title: 'Hairy Potato Cat', count: 4, image: '/cards/hairy-potato-cat.jpg', cat: true }
};

export const CARD_TYPES = Object.keys(CARD_INFO) as CardType[];

export function createCards(types: CardType[]): Card[] {
  const counters = new Map<CardType, number>();
  return types.map((type) => {
    const next = (counters.get(type) ?? 0) + 1;
    counters.set(type, next);
    return {
      id: `${type}-${next}`,
      type,
      title: CARD_INFO[type].title,
      image: CARD_INFO[type].image
    };
  });
}

export function createFullDeck(): Card[] {
  const types: CardType[] = [];
  for (const type of CARD_TYPES) {
    for (let i = 0; i < CARD_INFO[type].count; i += 1) {
      types.push(type);
    }
  }
  return createCards(types);
}

export function isCatCard(type: CardType): boolean {
  return Boolean(CARD_INFO[type].cat);
}
