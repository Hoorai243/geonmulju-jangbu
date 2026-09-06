// 파일 저장 — 웹은 브라우저 다운로드, 안드로이드 앱은 파일로 저장 후 "공유(저장/보내기)" 창.
// WebView 는 <a download> 로 파일이 안 받아지므로 네이티브에선 Filesystem + Share 를 쓴다.
import { toast, monthKey, h, openSheet } from '../util.js';
import * as db from '../db.js';
import * as auth from '../auth/auth.js';
import { ignoreNextBackground } from '../auth/autolock.js';

function cap() { return typeof window !== 'undefined' ? window.Capacitor : undefined; }
function isNative() { const c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); }

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// saveFile(파일이름, Blob) → 웹: 즉시 다운로드 / 앱: 저장+공유창. 성공 안내 토스트까지 처리.
export async function saveFile(filename, blob) {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('파일을 내려받았어요', 'ok');
    return { ok: true };
  }
  const c = cap();
  const Filesystem = c.Plugins && c.Plugins.Filesystem;
  const Share = c.Plugins && c.Plugins.Share;
  if (!Filesystem) { toast('이 기기에서 파일 저장을 쓸 수 없어요.', 'bad'); return { ok: false }; }
  try {
    const base64 = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
    if (Share) {
      try {
        ignoreNextBackground();
        await Share.share({ title: filename, url: res.uri, dialogTitle: '저장하거나 보내기' });
      } catch (e) {
        // 사용자가 공유 창을 닫은 경우 등 — 파일은 이미 저장돼 있음
      }
    } else {
      toast('파일을 저장했어요.', 'ok');
    }
    return { ok: true, uri: res.uri };
  } catch (e) {
    console.warn('파일 저장 실패', e);
    toast('파일 저장에 실패했어요.', 'bad');
    return { ok: false, error: String(e) };
  }
}

// 저장 전 확인 시트 (한 번 물어보기). 저장=true, 취소/닫기=false
function confirmSave(kind, filename) {
  return new Promise((resolve) => {
    let ctrl, done = false;
    const finish = (v) => { if (done) return; done = true; try { if (v) ctrl.close(); } catch (e) { /* noop */ } resolve(v); };
    ctrl = openSheet({
      title: kind === 'image' ? '사진으로 저장할까요?' : '엑셀로 저장할까요?',
      desc: kind === 'image' ? '사진 > 건물주장부 폴더에 저장돼요.' : '다운로드 > 건물주장부엑셀 폴더에 저장돼요.',
      onClose: () => finish(false),
      body: (close) => h('div', { class: 'stack' },
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)', wordBreak: 'break-all' } }, filename),
        h('button', { class: 'btn btn--primary btn--lg', onClick: () => finish(true) }, '저장'),
        h('button', { class: 'btn btn--secondary', onClick: () => close() }, '취소')),
    });
  });
}

// saveMedia(파일이름, Blob, kind) → 앱: 정해진 폴더에 바로 저장
//   kind 'image' → 사진(갤러리) > 건물주장부 폴더
//   kind 'excel' → 다운로드 > 건물주장부엑셀 폴더
//   폴더 없으면 만들고, 있으면 그 안에 그냥 저장. 웹에선 브라우저 다운로드로 대체.
export async function saveMedia(filename, blob, kind) {
  const mime = kind === 'image' ? 'image/png'
    : kind === 'backup' ? 'application/json'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const okMsg = kind === 'image' ? '사진 > 건물주장부 폴더에 저장했어요.'
    : kind === 'backup' ? '다운로드 폴더에 백업을 저장했어요.'
      : '다운로드 > 건물주장부엑셀 폴더에 저장했어요.';
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('파일을 내려받았어요', 'ok');
    return { ok: true };
  }
  const c = cap();
  const MediaSaver = c.Plugins && c.Plugins.MediaSaver;
  // 폴더 저장 플러그인이 없으면(구버전 앱) 기존 공유창 방식으로 대체
  if (!MediaSaver) return saveFile(filename, blob);
  // 이미지·엑셀은 한 번 확인 (바로 저장돼서 놀라지 않게). 백업은 앞에서 비밀번호로 이미 확인함.
  if (kind !== 'backup' && !(await confirmSave(kind, filename))) return { ok: false, cancelled: true };
  try {
    const base64 = await blobToBase64(blob);
    const res = await MediaSaver.save({ data: base64, filename, mime, kind });
    toast(okMsg, 'ok');
    return { ok: true, uri: res && res.uri };
  } catch (e) {
    console.warn('폴더 저장 실패, 공유창으로 대체', e);
    return saveFile(filename, blob);
  }
}

// 전체 백업 — 비밀번호로 잠근(암호화) 파일로 저장 + 마지막 백업 날짜 기록
export async function backupNow() {
  const pw = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '백업에 걸 비밀번호', autocomplete: 'new-password' });
  const pw2 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '한 번 더', autocomplete: 'new-password' });
  const fld = (label, input) => h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, label), input);

  return new Promise((resolve) => {
    let ctrl;
    const go = async () => {
      const p = pw.value;
      if (p.length < 4) return toast('비밀번호는 4자 이상으로 정해 주세요.', 'bad');
      if (p !== pw2.value) return toast('두 비밀번호가 서로 달라요.', 'bad');
      try {
        const enc = await auth.encryptBackup(p, await db.exportAll());
        const blob = new Blob([JSON.stringify(enc)], { type: 'application/json' });
        const r = await saveMedia(`건물주장부_백업_${monthKey()}.json`, blob, 'backup');
        if (r.ok) await db.metaSet('lastBackupAt', new Date().toISOString());
        ctrl.close(); resolve(r);
      } catch (e) { console.warn('백업 실패', e); toast('백업에 실패했어요.', 'bad'); }
    };
    ctrl = openSheet({
      title: '백업 파일 잠그기',
      desc: '이 비밀번호가 있어야 백업을 열 수 있어요. 앱 비밀번호와 같아도 돼요. 비밀번호를 잊으면 이 백업은 못 열어요.',
      body: () => h('div', { class: 'stack' }, fld('비밀번호', pw), fld('비밀번호 확인', pw2),
        h('button', { class: 'btn btn--primary btn--lg', onClick: go }, '잠그고 저장')),
    });
    setTimeout(() => pw.focus(), 100);
  });
}
