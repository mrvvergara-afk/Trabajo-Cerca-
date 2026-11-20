import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

// Generate native Android/Chrome icons from exactly the same SVG displayed
// in the splash screen and the web header. No separately-maintained old icon.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artwork = readFileSync(resolve(root,'public/brand/trabajo-cerca-oficial.svg'),'utf8');
if (!artwork.includes('Trabajo Cerca') || !artwork.includes('viewBox="0 0 1024 1024"')) {
  throw new Error('No se encontró el logo oficial SVG esperado.');
}
const jobs = [
  ['icon-192.png', 192, artwork],
  ['icon-512.png', 512, artwork],
  // Safe zone for Android maskable icons, with a solid light background.
  ['icon-maskable-512.png', 512, artwork.replace('viewBox="0 0 1024 1024"',
    'viewBox="-195 -195 1414 1414"')]
];
for (const [filename, size, source] of jobs) {
  const png = new Resvg(source, {
    fitTo: { mode:'width', value:size },
    font: {loadSystemFonts:true},
    background: '#ffffff'
  }).render().asPng();
  if (png.byteLength < 4000 || !Buffer.from(png).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw new Error('Falló la producción del icono '+filename);
  }
  const file = resolve(root,'public',filename);
  writeFileSync(file,png);
  console.log('PWA_ICON_READY',filename, size, png.length);
}
