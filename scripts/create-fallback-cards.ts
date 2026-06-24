import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CARD_INFO } from '../shared/cards';
import type { CardType } from '../shared/types';

const OUT_DIR = path.resolve('client/public/cards');
const colors: Record<CardType, string> = {
  'exploding-kitten': '#f05245',
  defuse: '#27a66d',
  nope: '#151515',
  attack: '#ef7d2f',
  skip: '#2f7de1',
  favor: '#8d5cf6',
  shuffle: '#f2b632',
  'see-the-future': '#22a6b3',
  'taco-cat': '#d75d41',
  cattermelon: '#4f9d69',
  'beard-cat': '#8a6b52',
  'rainbow-ralphing-cat': '#d9589d',
  'hairy-potato-cat': '#b8863b'
};

await mkdir(OUT_DIR, { recursive: true });

for (const [type, info] of Object.entries(CARD_INFO) as [CardType, (typeof CARD_INFO)[CardType]][]) {
  const title = escapeXml(info.title);
  const fill = colors[type];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336" role="img" aria-label="${title}">
  <rect width="240" height="336" rx="18" fill="#fffaf1"/>
  <rect x="10" y="10" width="220" height="316" rx="14" fill="${fill}"/>
  <rect x="24" y="24" width="192" height="288" rx="12" fill="#fffdf7" opacity=".94"/>
  ${art(type, fill)}
  <text x="120" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="800" fill="#161616">${title}</text>
  <text x="120" y="154" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="900" fill="${fill}">${symbol(type)}</text>
  <text x="120" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#333">Original Edition</text>
  <text x="120" y="272" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#666">Fallback card art</text>
</svg>`;
  await writeFile(path.join(OUT_DIR, `${type}.svg`), svg);
}

function symbol(type: CardType): string {
  if (type === 'exploding-kitten') return 'BOOM';
  if (type === 'defuse') return 'SAFE';
  if (type === 'nope') return 'NOPE';
  if (type === 'see-the-future') return '3';
  if (type === 'taco-cat') return 'TACO';
  if (type === 'cattermelon') return 'MELON';
  if (type === 'beard-cat') return 'BEARD';
  if (type === 'rainbow-ralphing-cat') return 'RAINBOW';
  if (type === 'hairy-potato-cat') return 'POTATO';
  return 'CARD';
}

function art(type: CardType, fill: string): string {
  const base = `<circle cx="120" cy="134" r="58" fill="${fill}" opacity=".18"/>`;
  if (type === 'taco-cat') {
    return `${base}<path d="M71 139q49-52 98 0q-49 32-98 0Z" fill="#f6c85f" stroke="${fill}" stroke-width="8"/><circle cx="101" cy="128" r="8" fill="${fill}"/><circle cx="139" cy="128" r="8" fill="${fill}"/>`;
  }
  if (type === 'cattermelon') {
    return `${base}<path d="M72 142a48 48 0 0 1 96 0q-48 44-96 0Z" fill="#65b96f" stroke="${fill}" stroke-width="8"/><path d="M87 139q33 25 66 0" fill="none" stroke="#f8cad0" stroke-width="14"/>`;
  }
  if (type === 'beard-cat') {
    return `${base}<circle cx="120" cy="130" r="42" fill="#f3d0a3" stroke="${fill}" stroke-width="7"/><path d="M82 150q38 45 76 0q-38 20-76 0Z" fill="${fill}"/>`;
  }
  if (type === 'rainbow-ralphing-cat') {
    return `${base}<circle cx="92" cy="128" r="26" fill="#f3d0a3" stroke="${fill}" stroke-width="6"/><path d="M116 132c20 0 22 42 55 42" fill="none" stroke="#ef4f6d" stroke-width="9"/><path d="M116 144c20 0 22 42 55 42" fill="none" stroke="#f2c84b" stroke-width="9"/><path d="M116 156c20 0 22 42 55 42" fill="none" stroke="#4fa3e3" stroke-width="9"/>`;
  }
  if (type === 'hairy-potato-cat') {
    return `${base}<ellipse cx="120" cy="137" rx="48" ry="38" fill="#c79655" stroke="${fill}" stroke-width="7"/><path d="M83 98l8 22M105 88l4 24M132 88l-5 24M157 99l-9 20" stroke="${fill}" stroke-width="6" stroke-linecap="round"/>`;
  }
  return base;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char]!);
}
