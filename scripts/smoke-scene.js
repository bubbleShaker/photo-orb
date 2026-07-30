// 3D シーンが本当に描画され、クリックで写真が選べるかを実物で確認する。
//
// `npm run check:scene` から electron で実行する（要ビルド: npm run build）。
// dialog を出さずに .sample-photos を開かせ、
//   1. renderer がエラーを出していないか
//   2. WebGL の描画結果が真っ黒でないか（写真が本当に見えているか）
//   3. 空間内の写真をクリックして選択状態になるか
// を検証し、最後にスクリーンショットを scratch/ へ保存する。
//
// 本番と同じ security.mjs / photo-session.mjs を通しているので、
// CSP が写真表示を壊した場合もここで気づける。
//
// CJS なのは Electron の CLI に .mjs を渡すと起動しないため（実測）。

const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('node:path');
const { writeFile, mkdir } = require('node:fs/promises');

const projectRoot = path.join(__dirname, '..');
const sampleDir = path.join(projectRoot, '.sample-photos');
const shotDir = path.join(projectRoot, 'scratch');

const results = [];

function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 指定座標を左クリックする（R3F の pointer イベントは Chromium が合成する）。 */
async function clickAt(webContents, x, y) {
  webContents.sendInputEvent({ type: 'mouseMove', x, y });
  await wait(60);
  webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await wait(40);
  webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  await wait(220);
}

async function main() {
  const { openLibrary } = await import('../src/main/photo-session.mjs');
  const { registerPhotoProtocol } = await import('../src/main/photo-protocol.mjs');
  const { applyContentSecurityPolicy, hardenWindow } = await import('../src/main/security.mjs');

  await app.whenReady();
  applyContentSecurityPolicy({ isDev: false });
  registerPhotoProtocol();
  // dialog の代わりに固定フォルダを返す。呼ばれる関数は本番と同じ openLibrary。
  ipcMain.handle('photo:pick-folder', () => openLibrary(sampleDir));

  const width = 1280;
  const height = 820;
  const window = new BrowserWindow({
    width,
    height,
    show: true, // WebGL を実際に走らせるため表示する（offscreen だと GPU 経路が変わる）
    backgroundColor: '#05060a',
    webPreferences: {
      preload: path.join(projectRoot, 'out/preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  hardenWindow(window);

  const consoleErrors = [];
  window.webContents.on('console-message', (event) => {
    // Electron 43 では第1引数がイベントオブジェクト。level/message はそこから読む。
    const level = event.level ?? '';
    const message = event.message ?? '';
    if (level === 'error') consoleErrors.push(message);
  });

  await window.loadFile(path.join(projectRoot, 'out/renderer/index.html'));
  await wait(700);

  const hasWelcomeButton = await window.webContents.executeJavaScript(
    `Boolean(document.querySelector('.welcome button'))`,
  );
  check('起動直後にフォルダを開くボタンが出る', hasWelcomeButton);

  // 「フォルダを開く」を押す = IPC を通って openLibrary が走る
  await window.webContents.executeJavaScript(`document.querySelector('.welcome button').click()`);
  // テクスチャ読み込みと浮遊アニメーションが落ち着くまで待つ
  await wait(2600);

  const state = await window.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    return {
      folderName: document.querySelector('.folder-name')?.textContent ?? null,
      count: document.querySelector('.count')?.textContent ?? null,
      hasCanvas: Boolean(canvas),
      canvasSize: canvas ? [canvas.width, canvas.height] : null,
      // getContext で新規作成されると null にならないため、参照が取れたかだけ見る
      hasWebgl: Boolean(gl),
      hint: document.querySelector('.hint')?.textContent ?? null,
    };
  })()`);

  check('フォルダ名が表示される', state.folderName === '.sample-photos', String(state.folderName));
  check('枚数が表示される', /14 枚/.test(state.count ?? ''), String(state.count));
  check('canvas が生成される', state.hasCanvas, JSON.stringify(state.canvasSize));
  check('WebGL コンテキストが取れる', state.hasWebgl);
  check('操作ヒントが出る', /ドラッグで見回す/.test(state.hint ?? ''), String(state.hint));

  // 描画結果を実際に読む。写真が 1 枚も出ていなければ、ほぼ背景色だけになる。
  const image = await window.webContents.capturePage();
  const bitmap = image.toBitmap(); // BGRA
  let litPixels = 0;
  for (let i = 0; i < bitmap.length; i += 4) {
    // 背景 #05060a より明らかに明るい画素を「何か描かれている」と数える
    if (bitmap[i] + bitmap[i + 1] + bitmap[i + 2] > 120) litPixels += 1;
  }
  const litRatio = litPixels / (bitmap.length / 4);
  check(
    '背景以外が描画されている（写真が見えている）',
    litRatio > 0.02,
    `明るい画素 ${(litRatio * 100).toFixed(1)}%`,
  );

  // 空間内の写真をクリックして選べるか。正面のどこに写真が来るかは
  // 枚数によって変わるので、中央付近の候補点を順に試す。
  const candidates = [
    [640, 410],
    [640, 300],
    [500, 410],
    [780, 410],
    [640, 520],
    [430, 300],
    [850, 520],
    [520, 250],
    [760, 250],
  ];
  let selectedName = null;
  for (const [x, y] of candidates) {
    await clickAt(window.webContents, x, y);
    // eslint-disable-next-line no-await-in-loop
    selectedName = await window.webContents.executeJavaScript(
      `document.querySelector('.selected-name')?.textContent ?? null`,
    );
    if (selectedName) break;
  }
  check('空間の写真をクリックすると選択される', Boolean(selectedName), String(selectedName));

  if (selectedName) {
    await wait(900); // カメラ前まで飛んでくるアニメーションを待つ
    const selectedShot = await window.webContents.capturePage();
    await mkdir(shotDir, { recursive: true });
    await writeFile(path.join(shotDir, 'scene-selected.png'), selectedShot.toPNG());

    // Esc で選択解除される
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await wait(400);
    const afterEscape = await window.webContents.executeJavaScript(
      `document.querySelector('.selected-name')?.textContent ?? null`,
    );
    check('Esc で選択が解除される', afterEscape === null, String(afterEscape));
  }

  await mkdir(shotDir, { recursive: true });
  await writeFile(path.join(shotDir, 'scene.png'), image.toPNG());
  console.log(`\nスクリーンショット: ${path.join(shotDir, 'scene.png')}`);

  check(
    'renderer が console.error を出していない',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' / '),
  );

  const failed = results.filter((result) => !result.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  app.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke テストが例外で終了:', err);
  app.exit(1);
});
