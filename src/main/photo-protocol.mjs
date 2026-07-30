// 写真の配信を担う独立モジュール。ここが「renderer に見せてよいものの境界」。
//
// セキュリティ方針:
// renderer に実パスを一切渡さず、dialog を通ったフォルダ配下のファイルへ発行した
// 使い捨てトークンだけを渡す。URL は photo-file://p/<uuid> の形になり、renderer 側で
// パスを組み立てる余地が無い = パストラバーサル(../../ や C:\Windows\...)が
// 構造的に入らない。Windows のドライブレターや日本語ファイル名を URL に埋める際の
// エンコード事故も避けられる。
//
// スキーム名を photo にせず photo-file にしているのは、短い汎用スキーム名が
// 将来 OS やブラウザ側で予約されるのを避けるため。
//
// 拡張子が .mjs なのは scripts/check-photo-protocol.mjs が「コピーではなく実物の
// このコード」を読み込んで検証できるようにするため（Node/Electron から直接
// import するファイルは .mjs、が本リポジトリの規約）。

import { protocol, net } from 'electron';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SCHEME = 'photo-file';
// host は固定。standard scheme では host がオリジンを分けるので、
// CSP を photo-file://p 単位で絞れるよう 1 つに寄せておく。
const HOST = 'p';

// カスタムプロトコルの特権登録は app.whenReady() より前に呼ぶ必要があるため、
// このモジュールを import した時点で走らせる（副作用のある import）。
//   standard … host/path を持つ通常の URL としてパースさせる
//   secure   … 安全なオリジン扱い(CSP や mixed content の扱いが file: より素直)
//   stream   … 応答をストリームで返せるようにする
//   corsEnabled … CORS 付きの要求を受け付ける
// corsEnabled が要るのは three の TextureLoader が img へ crossOrigin="anonymous" を
// 付けるため。付けない選択肢もあるが、その場合 canvas が tainted になり WebGL の
// texImage2D が SecurityError で落ちるので、CORS を通す側で解決する。
// supportFetchAPI は付けない: 用途はテクスチャの画像読み込みだけで、
// renderer からの fetch() を許す理由が無い(最小権限)。
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, stream: true, corsEnabled: true },
  },
]);

const photoTokens = new Map(); // token(uuid) → 絶対パス

/** 絶対パスへ使い捨てトークンを発行し、renderer へ渡せる URL を返す。 */
export function issuePhotoToken(filePath) {
  const token = crypto.randomUUID();
  photoTokens.set(token, filePath);
  return `${SCHEME}://${HOST}/${token}`;
}

/** photo-file://p/<token> から token を取り出す。形が違えば null。 */
export function tokenFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${SCHEME}:` || parsed.host !== HOST) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

/**
 * 全トークンを破棄する。フォルダを切り替えた時とウィンドウ破棄時に呼ぶ。
 * 呼ばないと、もう表示していない写真への参照が main のメモリに溜まり続ける。
 */
export function releaseAllPhotoTokens() {
  photoTokens.clear();
}

/** app.whenReady() 後に一度だけ呼ぶ。 */
export function registerPhotoProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const token = tokenFromUrl(request.url);
    const filePath = token && photoTokens.get(token);
    // 未登録トークン = 発行していないファイルへの要求。パスを推測されても届かない。
    if (!filePath) return new Response('Not Found', { status: 404 });
    try {
      // net.fetch に file:// を渡すと Electron が読み出しと Content-Type 判定を担う。
      // pathToFileURL を挟むのは、空白や日本語を含むパスを正しくエンコードするため。
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      // 選択後にファイルが移動/削除されると net.fetch は reject する。
      // ここで拾わないと main に unhandled error が出る。renderer 側は
      // 読み込み失敗として扱い、プレースホルダの板のままになる。
      console.error('[photo-file] 配信に失敗:', err);
      return new Response('Not Found', { status: 404 });
    }
  });
}
