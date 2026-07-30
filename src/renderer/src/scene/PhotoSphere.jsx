// 写真が浮かぶ空間そのもの。カメラは常に原点にいて、写真が球殻状に周囲を囲む。

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { MathUtils } from 'three';
import { sphereLayout } from '../sphere-layout.mjs';
import { CardErrorBoundary } from '../CardErrorBoundary.jsx';
import { PhotoCard, PlaceholderCard } from './PhotoCard.jsx';
import { LookAround, MAX_RADIUS, MIN_RADIUS } from './LookAround.jsx';

/**
 * 枚数に応じた初期距離。枚数が増えるほど球を大きくしないと写真同士が重なる。
 * 表面積が枚数に比例すればよいので半径は sqrt(枚数) に比例させる。
 */
function initialRadius(count) {
  return MathUtils.clamp(Math.sqrt(count) * 0.9, MIN_RADIUS, MAX_RADIUS);
}

export function PhotoSphere({ photos, selectedId, onSelect }) {
  const [radius, setRadius] = useState(() => initialRadius(photos.length));
  const layout = useMemo(() => sphereLayout(photos.length, { radius }), [photos.length, radius]);
  // ドラッグ状態を LookAround（入力元）と PhotoCard（クリック判定側）で共有する。
  // state にすると毎フレーム再レンダリングが走るので ref で持つ。
  const dragStateRef = useRef({ dragging: false, dragged: false });

  return (
    <Canvas
      // flat = トーンマッピング無効。写真の色を加工せずそのまま出す。
      flat
      dpr={[1, 2]}
      camera={{ position: [0, 0, 0], fov: 62, near: 0.05, far: 200 }}
      // 何もない空間のクリックで選択解除。ただし見回しドラッグの終わりは除く。
      onPointerMissed={() => {
        if (!dragStateRef.current.dragged) onSelect(null);
      }}
    >
      <color attach="background" args={['#05060a']} />
      {/* 星。写真だけが浮いていると距離感が掴めず、回しても動いた気がしない。 */}
      <Stars radius={80} depth={40} count={2200} factor={3} saturation={0} fade speed={0.4} />
      <LookAround enabled={!selectedId} dragStateRef={dragStateRef} onRadiusChange={setRadius} />
      {photos.map((photo, index) => (
        <CardErrorBoundary
          key={photo.id}
          fallback={<PlaceholderCard layout={layout[index]} broken />}
        >
          {/* 1 枚ごとに Suspense を張る。全体を包むと最後の 1 枚が読めるまで
              何も出ず、読めた順に空間へ現れる演出も失われる。 */}
          <Suspense fallback={<PlaceholderCard layout={layout[index]} />}>
            <PhotoCard
              photo={photo}
              layout={layout[index]}
              selected={photo.id === selectedId}
              dimmed={Boolean(selectedId) && photo.id !== selectedId}
              dragStateRef={dragStateRef}
              onSelect={onSelect}
            />
          </Suspense>
        </CardErrorBoundary>
      ))}
    </Canvas>
  );
}
