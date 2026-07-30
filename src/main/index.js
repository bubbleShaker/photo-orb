// main プロセスのエントリ。ウィンドウの組み立てと IPC の受け口だけを持つ。
//   photo-library  … フォルダ内の画像を列挙する
//   photo-protocol … 写真を renderer へ配信する（トークン方式）
//   photo-session  … 「フォルダを開く」ユースケース
//   security       … CSP と外部遷移の封鎖

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibrary } from './photo-session.mjs';
import { registerPhotoProtocol, releaseAllPhotoTokens } from './photo-protocol.mjs';
import { applyContentSecurityPolicy, hardenWindow } from './security.mjs';

// electron-vite の main 出力は CJS だが、ソースを ESM で書いているため
// __dirname は使えない。import.meta.url から復元する。
const currentDir = path.dirname(fileURLToPath(import.meta.url));

// dev は Vite の開発サーバから renderer を読む。この違いが CSP の緩さを分ける。
const isDev = Boolean(process.env['ELECTRON_RENDERER_URL']);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    // 3D 空間の外側は真っ黒に繋げたいので、読み込み前のちらつきも黒にする。
    backgroundColor: '#05060a',
    title: 'photo-orb',
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.js'),
      // renderer に Node は渡さない。必要な機能は preload の contextBridge へ
      // 関数を 1 つ足す形で増やす（PLAN.md の「崩さないこと」）。
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  hardenWindow(mainWindow);

  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(currentDir, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    releaseAllPhotoTokens();
  });
}

/** フォルダを選ばせ、中の写真を返す。キャンセル時は null。 */
async function handlePickFolder(event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(owner, {
    title: '写真フォルダを選ぶ',
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;
  try {
    return await openLibrary(filePaths[0]);
  } catch (err) {
    // 例外をそのまま外へ出すと Electron が message を文字列化して renderer の
    // invoke を reject する。fs のエラー(ENOENT/EACCES)は絶対パスを含むため、
    // ここで握って原因は main のログにだけ残し、renderer にはパスを含まない
    // 文言だけを返す（PLAN.md「renderer は絶対パスを受け取らない」）。
    console.error('[photo-orb] フォルダの読み込みに失敗:', err);
    throw new Error('フォルダを読み込めませんでした');
  }
}

app.whenReady().then(() => {
  applyContentSecurityPolicy({ isDev });
  registerPhotoProtocol();
  ipcMain.handle('photo:pick-folder', handlePickFolder);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
