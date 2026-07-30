// フォルダ内の画像ファイルを列挙する。
//
// 拡張子が .mjs なのは、このファイルを Node が直接 import してテストするため。
// package.json に type:module が無いので .js は CJS 扱いになり、import 文が
// 構文エラーになる。「Node から直接読むファイルは .mjs」がこのリポジトリの規約。
//
// 判定ロジック(pickPhotoNames)を fs から切り離してあるのは、並び順や除外条件を
// ファイルシステムを用意せずにテストできるようにするため。

import { readdir } from 'node:fs/promises';
import path from 'node:path';

// M1 の表示上限。4000x3000 の JPEG を無制限に GPU へ載せると VRAM が尽きるため、
// サムネイル生成(M2)を入れるまでは枚数で頭を押さえる。
export const MAX_PHOTOS = 60;

// 拡張子ホワイトリスト。ブラウザ(Chromium)がデコードできる形式だけを許す。
// HEIC は Chromium がデコードできないため入れない(M2 で sharp を入れたら扱える)。
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

/** 画像として扱うファイル名か。 */
export function isImageFileName(name) {
  // 先頭ドットは隠しファイル。macOS の AppleDouble(._IMG_0001.jpg)は拡張子が
  // 画像なのに中身がメタデータなので、ここで落としておかないと壊れた板が並ぶ。
  if (name.startsWith('.')) return false;
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * ファイル名の配列から、表示する写真の名前を順番付きで選ぶ。
 *
 * ソートは localeCompare の numeric オプション付き。これが無いと
 * IMG_10.jpg < IMG_2.jpg（辞書順）になり、撮影順とずれて見える。
 */
export function pickPhotoNames(names, limit = MAX_PHOTOS) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return names
    .filter(isImageFileName)
    .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
    .slice(0, limit);
}

/**
 * ディレクトリ直下の画像を列挙する。サブフォルダは辿らない（M1 の割り切り）。
 * 返すのは main プロセス内部用の絶対パス。renderer へは渡さないこと。
 */
export async function listPhotoFiles(dir, limit = MAX_PHOTOS) {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  return pickPhotoNames(names, limit).map((name) => ({
    name,
    filePath: path.join(dir, name),
  }));
}
