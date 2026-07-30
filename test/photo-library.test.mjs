import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isImageFileName,
  listPhotoFiles,
  MAX_PHOTOS,
  pickPhotoNames,
} from '../src/main/photo-library.mjs';

test('拡張子で画像を判定する（大文字も許す）', () => {
  assert.equal(isImageFileName('a.jpg'), true);
  assert.equal(isImageFileName('a.JPEG'), true);
  assert.equal(isImageFileName('a.webp'), true);
  assert.equal(isImageFileName('a.txt'), false);
  assert.equal(isImageFileName('a.heic'), false); // Chromium がデコードできない
  assert.equal(isImageFileName('noext'), false);
});

test('隠しファイルと AppleDouble を除外する', () => {
  assert.equal(isImageFileName('.DS_Store'), false);
  // 拡張子は画像だが中身はメタデータ。除外しないと壊れた板が並ぶ
  assert.equal(isImageFileName('._IMG_0001.jpg'), false);
});

test('数字を数値として並べる', () => {
  // 辞書順だと IMG_10 が IMG_2 より前に来て撮影順とずれる
  assert.deepEqual(pickPhotoNames(['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg']), [
    'IMG_1.jpg',
    'IMG_2.jpg',
    'IMG_10.jpg',
  ]);
});

test('上限で切る', () => {
  const names = Array.from({ length: 10 }, (_, i) => `p${i}.png`);
  assert.equal(pickPhotoNames(names, 4).length, 4);
  assert.equal(pickPhotoNames(names, 0).length, 0);
  assert.equal(pickPhotoNames(names, -1).length, 0);
  assert.equal(pickPhotoNames(names).length, 10); // 既定は MAX_PHOTOS
  assert.ok(MAX_PHOTOS > 10);
});

test('ディレクトリ直下の画像だけを絶対パス付きで返す', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'photo-orb-'));
  await writeFile(path.join(dir, 'b.png'), '');
  await writeFile(path.join(dir, 'a.jpg'), '');
  await writeFile(path.join(dir, 'note.txt'), '');

  const files = await listPhotoFiles(dir);
  assert.deepEqual(
    files.map((file) => file.name),
    ['a.jpg', 'b.png'],
  );
  assert.equal(files[0].filePath, path.join(dir, 'a.jpg'));
});
