// renderer に許す振る舞いの上限を決める層。
//
// index.js から切り出しているのは、ここが「アプリの防御線」そのもので、
// ウィンドウ生成や写真の列挙とは別の関心事だから。
// 切り出したことで scripts/smoke-scene.js が本番と同じポリシーを当てた状態で
// 画面を検証できる（CSP が写真の表示を壊していないかを実物で確認できる）。

import { session } from 'electron';

/**
 * CSP をレスポンスヘッダで付ける。
 *
 * index.html の meta ではなくヘッダにするのは、dev と prod でポリシーを
 * 変える必要があるため（dev は Vite の React Refresh が inline script を注入し、
 * HMR が WebSocket で localhost に繋ぐ）。静的な meta では両立できない。
 */
export function applyContentSecurityPolicy({ isDev }) {
  const policy = [
    "default-src 'self'",
    // 写真はカスタムプロトコル経由のみ。file: は許さない。
    "img-src 'self' photo-file: data: blob:",
    // three が Canvas 要素へ inline style を当てるため必要。
    "style-src 'self' 'unsafe-inline'",
    isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    isDev ? "connect-src 'self' ws://localhost:* http://localhost:*" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

/**
 * ウィンドウから外へ出る経路を塞ぐ。
 * このアプリは外部サイトを開く画面を一切持たないので、全部拒否でよい。
 */
export function hardenWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    // リロード（同一 URL）は許す。dev の HMR full reload がこれに当たる。
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
}
