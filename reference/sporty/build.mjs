// Inline the split showroom (index.html + local scripts) into one self-contained file,
// matching the format of reference/vehicle-showroom.html.
// Usage: node build.mjs [out]   (default: ../vehicle-showroom-sporty.html)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, '..', 'vehicle-showroom-sporty.html'));
const html = readFileSync(path.join(here, 'index.html'), 'utf8').replace(
  /<script src="(?!https?:)([^"]+)"><\/script>/g,
  (_, src) => `<script>/* ${src} */\n${readFileSync(path.join(here, src), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`
);
writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(1)} KB)`);
