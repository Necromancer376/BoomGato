import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CARD_INFO } from '../shared/cards';
import type { CardType } from '../shared/types';

const LIST_URL = 'https://explodi.ng/decks/exploding-kittens-original-edition/cards';
const CAT_CARD_URL = 'https://explodi.ng/card/cat-card';
const OUT_DIR = path.resolve('client/public/cards');
const IMAGE_HINTS: Record<CardType, string[]> = {
  'exploding-kitten': ['/images/cards/exploding-kitten/artworks/Exploding-Kitten-Alien.jpg', '/images/cards/exploding-kitten/exploding-kitten.png'],
  defuse: ['/images/cards/defuse/artworks/Defuse-Via-3AM-Flatulence.jpg', '/images/cards/defuse/defuse.png'],
  nope: ['/images/cards/nope/artworks/Nope-A-Jackanope-Bounds-into-the-Room.jpg', '/images/cards/nope/nope.png'],
  attack: ['/images/cards/attack-2x/artworks/Attack-Bear-o-Dactyl.jpg', '/images/cards/attack-2x/attack-2x.png'],
  skip: ['/images/cards/skip/artworks/Skip-Commandeer-a-Bunnyraptor.jpg', '/images/cards/skip/skip.png'],
  favor: ['/images/cards/favor/artworks/Favor-Fall-So-Deeply-in-Love.jpg', '/images/cards/favor/favor.png'],
  shuffle: ['/images/cards/shuffle/artworks/Shuffle-A-Kraken-Emerges-and-Hes-Super-Upset.jpg', '/images/cards/shuffle/shuffle.png'],
  'see-the-future': ['/images/cards/see-the-future-3x/artworks/See-the-Future-Ask-the-All-Seeing-Goat-Wizard.jpg', '/images/cards/see-the-future-3x/see-the-future-3x.png'],
  'taco-cat': ['/images/cards/cat-card/artworks/Tacocat.jpg'],
  cattermelon: ['/images/cards/cat-card/artworks/Cattermelon.jpg'],
  'beard-cat': ['/images/cards/cat-card/artworks/Beard-Cat.jpg'],
  'rainbow-ralphing-cat': ['/images/cards/cat-card/artworks/Rainbow-Ralphing-Cat.jpg'],
  'hairy-potato-cat': ['/images/cards/cat-card/artworks/Hairy-Potato-Cat.jpg']
};

const titleToType = new Map<string, CardType>(
  (Object.entries(CARD_INFO) as [CardType, (typeof CARD_INFO)[CardType]][]).map(([type, info]) => [normalize(info.title), type])
);

await mkdir(OUT_DIR, { recursive: true });

const downloaded = new Set<CardType>();
for (const [type, hints] of Object.entries(IMAGE_HINTS) as [CardType, string[]][]) {
  for (const hint of hints) {
    const base = hint.includes('/images/cards/cat-card/artworks/') ? CAT_CARD_URL : LIST_URL;
    const imageUrl = new URL(hint, base).href;
    if (await download(type, imageUrl)) {
      downloaded.add(type);
      break;
    }
  }
}

const listHtml = await fetchText(LIST_URL);
const $ = cheerio.load(listHtml);
const links = new Set<string>();
$('a[href]').each((_i, element) => {
  const href = $(element).attr('href');
  if (!href) return;
  const url = new URL(href, LIST_URL);
  if (url.href.includes('/decks/exploding-kittens-original-edition/cards/')) links.add(url.href);
});

for (const link of links) {
  const html = await fetchText(link);
  const page = cheerio.load(html);
  const heading = normalize(page('h1').first().text() || page('title').text());
  const type = [...titleToType.entries()].find(([title]) => heading.includes(title))?.[1];
  if (!type || downloaded.has(type)) continue;
  const imageUrl = findImageUrl(page, link);
  if (!imageUrl) continue;
  if (await download(type, imageUrl)) downloaded.add(type);
}

async function download(type: CardType, imageUrl: string): Promise<boolean> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) return false;
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  await writeFile(path.join(OUT_DIR, `${type}.jpg`), bytes);
  console.log(`downloaded ${type} from ${imageUrl}`);
  return true;
}

for (const type of Object.keys(CARD_INFO) as CardType[]) {
  if (!downloaded.has(type)) console.warn(`no official image found for ${type}; keeping fallback asset`);
}

function findImageUrl(page: cheerio.CheerioAPI, base: string): string | null {
  const candidates: string[] = [];
  page('meta[property="og:image"], meta[name="twitter:image"]').each((_i, element) => {
    const value = page(element).attr('content');
    if (value) candidates.push(value);
  });
  page('img[src]').each((_i, element) => {
    const src = page(element).attr('src');
    const alt = page(element).attr('alt') ?? '';
    if (src && /card|kitten|defuse|favor|shuffle|attack|skip|nope|cat/i.test(`${src} ${alt}`)) candidates.push(src);
  });
  const raw = candidates.find(Boolean);
  return raw ? new URL(raw, base).href : null;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': 'BoomGato/1.0' } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
