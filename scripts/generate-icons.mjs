// Generates the PWA icons from an original SVG (gold star + football on electric blue).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#2979ff"/><stop offset="0.55" stop-color="#0d1a3f"/><stop offset="1" stop-color="#080e1d"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset="0.5" stop-color="#feb700"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${pad})">
    <circle r="190" fill="none" stroke="#4edea3" stroke-width="10" opacity="0.6"/>
    <path transform="translate(0 -18)" d="M0 -170 L47 -66 L160 -54 L75 22 L99 135 L0 78 L-99 135 L-75 22 L-160 -54 L-47 -66 Z" fill="#6b4b00" />
    <path transform="translate(0 -26)" d="M0 -170 L47 -66 L160 -54 L75 22 L99 135 L0 78 L-99 135 L-75 22 L-160 -54 L-47 -66 Z" fill="url(#gold)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
    <circle cx="0" cy="96" r="70" fill="#fff" stroke="#1b1f2a" stroke-width="6"/>
    <path d="M0 66 l28 20 -11 33 h-34 l-11 -33 z" fill="#1b1f2a"/>
    <path d="M-62 74 l22 8 -2 28 -24 10 M62 74 l-22 8 2 28 24 10" fill="#1b1f2a"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const out = async (size, pad, name) => sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
await out(192, 1, 'icon-192.png');
await out(512, 1, 'icon-512.png');
await out(192, 0.78, 'maskable-192.png');
await out(512, 0.78, 'maskable-512.png');
await out(180, 0.92, 'apple-touch-icon.png');
await out(48, 1, 'favicon-48.png');
console.log('icons generated');
