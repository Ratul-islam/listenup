// Draws a profile picture for every built-in voice, and the list the app loads them from.
//
//   cd tools/voice-faces && pnpm install && pnpm generate
//
// The faces are Lorelei by Lisa Wischofsky (CC0 1.0, public domain), put together with DiceBear.
// Each voice's look is picked from hand-chosen parts in a fixed order, so running this again
// draws the same faces; a new voice in the backend's catalog gets one too. To change a face,
// add the voice to OVERRIDES below.
import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = fs.readFileSync(path.join(root, 'backend/src/modules/voices/voice-catalog.ts'), 'utf8');
const outDir = path.join(root, 'frontend/assets/voices');
const listFile = path.join(root, 'frontend/src/features/voices/voice-faces.ts');

// The largest a face is shown is 56 dp, which is 168 px on the sharpest screens
const SIZE = 192;

const inCatalog = [...catalog.matchAll(/voice\(\{ id: '([a-z-]+)', name: '([^']+)', language: '([a-z]+)',[^}]*?gender: '(female|male)'/g)].map(([, id, name, language, gender]) => ({ id, name, language, gender }));
if (inCatalog.length < 40) throw new Error(`Only found ${inCatalog.length} voices in the catalog; has its format changed?`);

// Parts are handed out in order, so the voices that already have a face go first, in the order they were
// drawn, and new ones after: adding a voice anywhere in the catalog never changes anyone else's face
const before = fs.existsSync(listFile) ? [...fs.readFileSync(listFile, 'utf8').matchAll(/^ {2}'?([a-z-]+)'?: require/gm)].map((m) => m[1]) : [];
const drawnBefore = (id) => (before.includes(id) ? before.indexOf(id) : before.length);
const voices = [...inCatalog].sort((a, b) => drawnBefore(a.id) - drawnBefore(b.id) || inCatalog.indexOf(a) - inCatalog.indexOf(b));

const v = (n) => `variant${String(n).padStart(2, '0')}`;

// Parts chosen by eye from the full set: friendly, and clear at 40 px
const HAIR = {
  female: [35, 16, 45, 13, 21, 40, 24, 31, 15, 38, 10, 46, 32, 19, 41, 29, 37, 14, 23, 33, 18, 42, 48, 30],
  male: [4, 8, 39, 1, 6, 12, 22, 3, 36, 7, 9, 2, 43, 5, 47, 44, 20, 11],
};
const EYES = [9, 4, 12, 14, 20, 2, 10, 13, 21, 24, 6, 16, 23, 11];
const MOUTHS = ['happy01', 'happy02', 'happy06', 'happy13', 'happy04', 'happy03', 'happy14', 'happy10'];
const BROWS = [1, 2, 3, 5, 7, 9, 10, 12];
const NOSES = [1, 2, 3, 4, 5, 6];

// Skin and hair by where the voice is from; English voices cover the whole range
const SKIN = {
  en: ['f3cfb3', 'b97c55', 'e5b28f', '8f5a3a', 'fbe3d4', 'd29a73'],
  south: ['d29a73', 'b97c55', 'e0aa84', 'c58a62'],
  latin: ['e5b28f', 'd29a73', 'f3cfb3', 'c58a62'],
  europe: ['f3cfb3', 'fbe3d4', 'e9bf9f'],
  east: ['f6dcc4', 'f1cdb0', 'f9e3d0'],
  island: ['d9a47c', 'c98f66'],
};
const HAIR_COLOUR = {
  en: ['2a1c14', '1f1a17', '8a5a2b', '3b2a20', 'b9853f', '5a3a22'],
  south: ['1f1a17', '2a1c14'],
  latin: ['2a1c14', '3b2a20', '1f1a17', '5a3a22'],
  europe: ['5a3a22', '8a5a2b', '2a1c14', 'b9853f'],
  east: ['1f1a17', '26201c'],
  island: ['1f1a17', '2a1c14'],
};
const REGION = { en: 'en', bn: 'south', hi: 'south', ur: 'south', es: 'latin', pt: 'latin', fr: 'europe', it: 'europe', ja: 'east', zh: 'east', id: 'island' };

// The disc behind each face: soft, and never the same twice in a row
const DISCS = [
  ['#cfc4ff', '#f1edff'],
  ['#ffcfe0', '#fff1f6'],
  ['#bfe6d8', '#eefaf5'],
  ['#ffdcae', '#fff6e8'],
  ['#bcd9ff', '#eef5ff'],
  ['#e7c6f5', '#f9effd'],
  ['#c8ecc0', '#f1fbee'],
  ['#ffd0c2', '#fff2ee'],
];

// Faces adjusted by hand after looking at the sheet
const OVERRIDES = {
  george: { glasses: [v(4)], glassesProbability: 100, hairColor: ['7b7b84'] },
  eleanor: { glasses: [v(1)], glassesProbability: 100 },
  atlas: { beard: [v(2)], beardProbability: 100 },
  kabir: { glasses: [v(3)], glassesProbability: 100 },
  nicola: { glasses: [v(4)], glassesProbability: 100 },
  ken: { hair: [v(7)] },
  yunxi: { hair: [v(2)] },
  diego: { beard: [v(2)], beardProbability: 100 },
  tanisha: { earrings: [v(2)], earringsProbability: 100 },
  valeria: { earrings: [v(1)], earringsProbability: 100 },
  ayesha: { hair: [v(40)] },
  sari: { hairAccessories: ['flowers'], hairAccessoriesProbability: 100, hairAccessoriesColor: ['e8799b'] },
  // The voices added in October 2026
  sana: { hair: [v(32)], earrings: [v(1)], earringsProbability: 100 },
  lin: { hair: [v(13)] },
  imran: { beard: [v(2)], beardProbability: 100 },
  henry: { glasses: [v(1)], glassesProbability: 100 },
};

const counts = {};
const next = (key) => (counts[key] = (counts[key] ?? -1) + 1);
const pick = (list, key, step = 1) => list[(next(key) * step) % list.length];

function faceOf(voice, index) {
  const region = REGION[voice.language] ?? 'en';
  const options = {
    size: SIZE,
    seed: voice.id,
    hair: [v(pick(HAIR[voice.gender], `hair:${voice.gender}`))],
    eyes: [v(pick(EYES, 'eyes', 3))],
    mouth: [pick(MOUTHS, 'mouth', 3)],
    eyebrows: [v(pick(BROWS, 'brows', 5))],
    nose: [v(pick(NOSES, 'nose', 5))],
    head: [v((index % 4) + 1)],
    skinColor: [pick(SKIN[region], `skin:${region}`)],
    hairColor: [pick(HAIR_COLOUR[region], `hairColour:${region}`)],
    beardProbability: 0,
    glassesProbability: 0,
    earringsProbability: 0,
    frecklesProbability: 0,
    hairAccessoriesProbability: 0,
    ...OVERRIDES[voice.id],
  };
  const face = createAvatar(lorelei, options).toString();
  const [from, to] = DISCS[index % DISCS.length];
  // The head a little larger than drawn, so it fills a small circle
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs><linearGradient id="disc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#disc)"/>
    <g transform="translate(${SIZE * -0.07}, ${SIZE * 0.045}) scale(1.14)">${face}</g>
  </svg>`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const file of fs.readdirSync(outDir)) if (file.endsWith('.png')) fs.rmSync(path.join(outDir, file));

const drawn = voices.map((voice, index) => {
  const svg = faceOf(voice, index);
  fs.writeFileSync(path.join(outDir, `${voice.id}.png`), new Resvg(svg).render().asPng());
  return { ...voice, svg };
});

fs.writeFileSync(
  listFile,
  `// Made by tools/voice-faces (pnpm generate); don't edit by hand.
// The faces are Lorelei by Lisa Wischofsky, CC0 1.0.

/** Each built-in voice's profile picture, by voice id */
export const VOICE_FACES: Record<string, number> = {
${voices.map((voice) => `  ${/^[a-z]+$/.test(voice.id) ? voice.id : `'${voice.id}'`}: require('@/assets/voices/${voice.id}.png'),`).join('\n')}
};
`,
);

// A sheet of every face with its name, to look them over (pass a path to write it)
const sheetPath = process.argv[2];
if (sheetPath) {
  const COLS = 8;
  const CELL = 150;
  const cells = drawn
    .map(({ name, gender, language, svg }, i) => {
      const x = (i % COLS) * (CELL + 14) + 14;
      const y = Math.floor(i / COLS) * (CELL + 34) + 14;
      // The picture without its outer <svg>, with its gradient renamed so 46 of them can share a file
      const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')).replaceAll('id="disc"', `id="disc${i}"`).replaceAll('url(#disc)', `url(#disc${i})`);
      return `<g transform="translate(${x}, ${y})"><clipPath id="clip${i}"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="${CELL / 2}"/></clipPath><g clip-path="url(#clip${i})"><g transform="scale(${CELL / SIZE})">${inner}</g></g><text x="${CELL / 2}" y="${CELL + 20}" text-anchor="middle" font-size="15" font-family="sans-serif">${name} (${language}, ${gender[0]})</text></g>`;
    })
    .join('');
  const width = COLS * (CELL + 14) + 14;
  const height = Math.ceil(drawn.length / COLS) * (CELL + 34) + 14;
  fs.writeFileSync(sheetPath, new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f5f3ff"/>${cells}</svg>`).render().asPng());
}

console.log(`Drew ${voices.length} faces into ${path.relative(root, outDir)}`);
