// 웹 자산을 www/ 로 모아 Capacitor(안드로이드 앱)가 담을 수 있게 한다.
// 실행: npm run build:www  (그다음 npx cap sync 로 앱에 반영)
import { cp, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

const ITEMS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });
for (const item of ITEMS) {
  await cp(join(root, item), join(www, item), { recursive: true }).catch((e) => {
    console.warn(`건너뜀: ${item} (${e.code})`);
  });
}
console.log('www/ 준비 끝 — 담은 항목:', ITEMS.join(', '));
