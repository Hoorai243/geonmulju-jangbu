// 안드로이드 보안 패치 — MainActivity 에 FLAG_SECURE 를 넣어
// 스크린샷 차단 + 앱 전환(멀티태스킹) 미리보기에서 화면을 가린다.
// cap sync 후 실행한다(멱등: 여러 번 돌려도 안전). android 폴더 경로를 인자로 받을 수 있음.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = process.argv[2] || join(root, 'android');
const javaRoot = join(androidDir, 'app/src/main/java');

// MainActivity.java 를 재귀로 찾는다(패키지 경로가 바뀌어도 대응)
async function findMainActivity(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const found = await findMainActivity(p); if (found) return found; }
    else if (e.name === 'MainActivity.java') return p;
  }
  return null;
}

const SECURE = `package %PKG%;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 화면 가림: 스크린샷·앱 전환 미리보기에서 내용 안 보이게
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
`;

const file = await findMainActivity(javaRoot);
if (!file) { console.log('MainActivity.java 를 못 찾음:', javaRoot); process.exit(0); }
const cur = await readFile(file, 'utf8');
if (cur.includes('FLAG_SECURE')) { console.log('이미 적용됨:', file); process.exit(0); }
const pkg = (cur.match(/package\s+([\w.]+)\s*;/) || [])[1] || 'com.hoorai.jangbu';
await writeFile(file, SECURE.replace('%PKG%', pkg), 'utf8');
console.log('FLAG_SECURE 적용:', file);
