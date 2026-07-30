import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-vite は main / preload / renderer を別々にビルドする。
// エントリは規約で自動検出される（src/main/index.js, src/preload/index.js,
// src/renderer/index.html）ので、ここで列挙する必要はない。
//
// main / preload のソースは ESM(import) で書く。electron-vite が rollup で
// 1 ファイルにバンドルし、出力は CJS になる（package.json に type:module を
// 置いていないため）。ソースを require() で書くと rollup が依存を追跡できず
// 起動時に Cannot find module で落ちるので、import で書くこと。
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // renderer だけ React を有効化（JSX 変換 + HMR）
    plugins: [react()],
  },
});
