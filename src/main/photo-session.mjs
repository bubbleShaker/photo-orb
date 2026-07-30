// 「フォルダを開く」というユースケースそのもの。
// ファイル列挙(photo-library)とトークン発行(photo-protocol)を組み合わせて、
// renderer に渡してよい形だけを作る。
//
// dialog を含めないのは、この処理を UI 抜きで呼べるようにするため
// （scripts/smoke-scene.js が本物のこの関数を叩いて画面を検証する）。

import path from 'node:path';
import { listPhotoFiles, MAX_PHOTOS } from './photo-library.mjs';
import { issuePhotoToken, releaseAllPhotoTokens } from './photo-protocol.mjs';

/**
 * フォルダ内の写真を renderer 向けの形にして返す。
 * @returns { folderName, limit, photos: [{ id, name, url }] }
 *   url は photo-file://p/<uuid>。絶対パスは一切含めない。
 */
export async function openLibrary(dir, limit = MAX_PHOTOS) {
  const files = await listPhotoFiles(dir, limit);

  // 前のフォルダのトークンは無効化する。残すと表示していない写真への参照が
  // main のメモリに溜まり、古い URL がいつまでも生きてしまう。
  releaseAllPhotoTokens();

  return {
    // フォルダ名だけを見出しに使う。フルパスは renderer へ渡さない。
    folderName: path.basename(dir),
    limit,
    photos: files.map((file) => {
      const url = issuePhotoToken(file.filePath);
      // id は React の key 用。トークン URL は 1 ファイルにつき一意なので流用する。
      return { id: url, name: file.name, url };
    }),
  };
}
