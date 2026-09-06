// 안드로이드 패치 — cap sync 후 실행(멱등: 여러 번 돌려도 안전).
//  1) MainActivity: FLAG_SECURE(스크린샷 차단) + MediaSaver 플러그인 등록
//  2) MediaSaver.java 설치 — 이미지는 사진>건물주장부, 엑셀은 다운로드>건물주장부엑셀 폴더에 저장(MediaStore)
//  3) AndroidManifest: 안드로이드 9 이하 저장용 권한 추가
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

const MAIN = `package %PKG%;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 파일 저장 플러그인 등록(사진/엑셀 폴더 저장)
        registerPlugin(MediaSaver.class);
        super.onCreate(savedInstanceState);
        // 화면 가림: 스크린샷·앱 전환 미리보기에서 내용 안 보이게
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
`;

const MEDIA = `package %PKG%;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

// 이미지: 사진(갤러리) > 건물주장부 폴더 / 엑셀: 다운로드 > 건물주장부엑셀 폴더.
// 폴더 없으면 만들고, 있으면 그 안에 그냥 저장.
@CapacitorPlugin(name = "MediaSaver")
public class MediaSaver extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String kind = call.getString("kind", "excel");
        if (data == null) { call.reject("no data"); return; }
        byte[] bytes;
        try { bytes = Base64.decode(data, Base64.DEFAULT); }
        catch (Exception e) { call.reject("bad base64: " + e.getMessage()); return; }

        boolean isImage = "image".equals(kind);
        boolean isBackup = "backup".equals(kind);
        // 사진>건물주장부 / 다운로드>건물주장부엑셀 / 백업은 다운로드 폴더 바로
        String subDir = isImage ? "건물주장부" : (isBackup ? "" : "건물주장부엑셀");

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                Uri collection;
                if (isImage) {
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + subDir);
                    collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                } else {
                    String rel = subDir.isEmpty() ? Environment.DIRECTORY_DOWNLOADS : (Environment.DIRECTORY_DOWNLOADS + "/" + subDir);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
                    collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                }
                Uri item = resolver.insert(collection, values);
                if (item == null) { call.reject("insert failed"); return; }
                OutputStream os = resolver.openOutputStream(item);
                if (os == null) { call.reject("open stream failed"); return; }
                os.write(bytes);
                os.flush();
                os.close();
                JSObject ret = new JSObject();
                ret.put("uri", item.toString());
                call.resolve(ret);
            } else {
                // 안드로이드 9 이하: 공용 폴더에 직접 저장 후 갤러리 스캔
                File base = Environment.getExternalStoragePublicDirectory(
                        isImage ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS);
                File dir = new File(base, subDir);
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(out);
                fos.write(bytes);
                fos.flush();
                fos.close();
                android.media.MediaScannerConnection.scanFile(getContext(),
                        new String[]{ out.getAbsolutePath() }, new String[]{ mime }, null);
                JSObject ret = new JSObject();
                ret.put("uri", Uri.fromFile(out).toString());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage());
        }
    }
}
`;

// --- MainActivity + MediaSaver 설치 ---
const file = await findMainActivity(javaRoot);
if (!file) { console.log('MainActivity.java 를 못 찾음:', javaRoot); process.exit(0); }
const cur = await readFile(file, 'utf8');
const pkg = (cur.match(/package\s+([\w.]+)\s*;/) || [])[1] || 'com.hoorai.jangbu';
await writeFile(file, MAIN.replace('%PKG%', pkg), 'utf8');
await writeFile(join(dirname(file), 'MediaSaver.java'), MEDIA.replace('%PKG%', pkg), 'utf8');
console.log('MainActivity(FLAG_SECURE+플러그인 등록) + MediaSaver 설치:', dirname(file));

// --- AndroidManifest: 안드로이드 9 이하 저장 권한 ---
const manifestPath = join(androidDir, 'app/src/main/AndroidManifest.xml');
try {
  let mf = await readFile(manifestPath, 'utf8');
  if (!mf.includes('WRITE_EXTERNAL_STORAGE')) {
    const perm = '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />\n';
    mf = mf.replace('    <uses-permission android:name="android.permission.INTERNET" />',
      '    <uses-permission android:name="android.permission.INTERNET" />\n' + perm);
    await writeFile(manifestPath, mf, 'utf8');
    console.log('저장 권한 추가(maxSdkVersion 28):', manifestPath);
  } else {
    console.log('저장 권한 이미 있음:', manifestPath);
  }
} catch (e) {
  console.log('AndroidManifest 패치 건너뜀:', String(e));
}
