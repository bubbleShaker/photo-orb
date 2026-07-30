// 画面全体の状態を持つ層。3D の中身は PhotoSphere に任せ、ここは
// 「どのフォルダを開いているか」「どれを選んでいるか」だけを見る。

import { useCallback, useEffect, useState } from 'react';
import { PhotoSphere } from './scene/PhotoSphere.jsx';

export default function App() {
  const [library, setLibrary] = useState(null); // { folderName, limit, photos }
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const openFolder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.photoOrb.pickFolder();
      if (!result) return; // ダイアログのキャンセル
      setSelectedId(null);
      setLibrary(result);
    } catch {
      // 例外の中身は画面に出さない。main の fs エラーには絶対パスが載るため、
      // main 側で握り潰した上で、ここでも message に依存しない（二重防御）。
      // 原因は main のログを見る。
      setError('フォルダを読み込めませんでした');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedPhoto = library?.photos.find((photo) => photo.id === selectedId) ?? null;
  const isEmptyFolder = library !== null && library.photos.length === 0;

  return (
    <div className="app">
      {library && library.photos.length > 0 && (
        // key に先頭写真のトークンを使い、フォルダを開き直したら
        // PhotoSphere ごと作り直す（距離などの内部状態をリセットするため）。
        <PhotoSphere
          key={library.photos[0].id}
          photos={library.photos}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {!library && (
        <div className="welcome">
          <h1>photo-orb</h1>
          <p>写真が浮かぶ空間から、一枚を選ぶ。</p>
          <button type="button" className="primary" onClick={openFolder} disabled={loading}>
            {loading ? '読み込み中…' : 'フォルダを開く'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {library && (
        <header className="toolbar">
          <div className="folder">
            <span className="folder-name">{library.folderName}</span>
            <span className="count">
              {library.photos.length} 枚
              {library.photos.length >= library.limit && `（上限 ${library.limit}）`}
            </span>
          </div>
          <button type="button" onClick={openFolder} disabled={loading}>
            {loading ? '読み込み中…' : '別のフォルダ'}
          </button>
        </header>
      )}

      {isEmptyFolder && (
        <div className="welcome">
          <p>このフォルダに表示できる画像がありませんでした。</p>
          <button type="button" className="primary" onClick={openFolder}>
            別のフォルダを開く
          </button>
        </div>
      )}

      {library && library.photos.length > 0 && (
        <footer className="statusbar">
          {selectedPhoto ? (
            <>
              <span className="selected-name">{selectedPhoto.name}</span>
              <span className="hint">Esc / もう一度クリックで空間に戻す</span>
            </>
          ) : (
            <span className="hint">ドラッグで見回す・ホイールで前後・クリックで選ぶ</span>
          )}
        </footer>
      )}

      {error && library && <p className="error floating">{error}</p>}
    </div>
  );
}
