// photo-file:// プロトコルの回帰ガード。
// `npm run check:protocol` から electron で実行する（protocol / net は
// Electron のランタイムでしか動かないため、node --test では検証できない）。
//
// src/main/photo-protocol.mjs の実物を import して叩いているので、
// 実装を変えて防御が緩んだらここが落ちる。
//
// このファイルだけ CJS(.js + require) なのは、Electron の CLI に .mjs を
// エントリとして渡すと ESM ローダーが働かず起動しないため（実測）。
// ESM である実装側は動的 import() で読み込む。

const { app, net } = require('electron');
const { mkdtemp, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const results = [];

function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const { issuePhotoToken, registerPhotoProtocol, releaseAllPhotoTokens, tokenFromUrl } =
    await import('../src/main/photo-protocol.mjs');

  await app.whenReady();
  registerPhotoProtocol();

  const dir = await mkdtemp(path.join(tmpdir(), 'photo-orb-check-'));
  // 日本語 + 空白を含むパス。URL エンコード漏れがあればここで落ちる。
  const filePath = path.join(dir, '写真 001.png');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  );
  await writeFile(filePath, png);

  const url = issuePhotoToken(filePath);
  check(
    '発行される URL が photo-file://p/<uuid> 形式',
    /^photo-file:\/\/p\/[0-9a-f-]{36}$/.test(url),
    url,
  );
  check('URL に実パスが含まれない', !url.includes('写真') && !url.includes(dir));

  const response = await net.fetch(url);
  check('発行済みトークンで画像が取れる', response.status === 200, `status=${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  check('中身が元ファイルと一致する（日本語+空白のパスでも読める）', body.equals(png));
  check(
    'Content-Type が画像として判定される',
    /^image\//.test(response.headers.get('content-type') ?? ''),
    response.headers.get('content-type'),
  );

  // 未発行トークンは届かない = パスを推測されても読み出せない
  const unknown = await net.fetch(`photo-file://p/${crypto.randomUUID()}`);
  check('未発行トークンは 404', unknown.status === 404, `status=${unknown.status}`);

  // URL にパスを直接書いても解決されない（トラバーサルが構造的に成立しない）
  const traversal = await net.fetch('photo-file://p/..%2F..%2F..%2Fetc%2Fpasswd');
  check('パスらしき文字列を渡しても 404', traversal.status === 404, `status=${traversal.status}`);
  check('別ホストの URL は token として解釈しない', tokenFromUrl('photo-file://evil/abc') === null);
  check('他スキームの URL は token として解釈しない', tokenFromUrl('file:///etc/passwd') === null);

  // フォルダ切り替え相当。破棄後は同じ URL でも届かない
  releaseAllPhotoTokens();
  const afterRelease = await net.fetch(url);
  check('トークン破棄後は 404', afterRelease.status === 404, `status=${afterRelease.status}`);

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  app.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('検証スクリプトが例外で終了:', err);
  app.exit(1);
});
