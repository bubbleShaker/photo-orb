// 空間に浮かぶ写真 1 枚。板にテクスチャを貼り、ゆらゆら動かし、
// ホバーで強調し、選択されたらカメラの前まで飛んでくる。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { Color, MathUtils, Object3D, SRGBColorSpace, Vector3 } from 'three';

const CARD_HEIGHT = 1.5; // 板の高さ。幅は写真のアスペクト比から決める
const FRAME_PADDING = 0.08;
const HOVER_SCALE = 1.12;
const SELECTED_SCALE = 1.9;
const SELECTED_DISTANCE = 3.4; // カメラから選択カードまでの距離
const FLOAT_AMPLITUDE = 0.18;
const ACCENT = '#7cc7ff';

/** 追従の速さ。delta を使うのでモニタのリフレッシュレートに依らず同じ速度になる。 */
function followRate(delta, speed) {
  return 1 - Math.exp(-speed * delta);
}

export function PhotoCard({ photo, layout, selected, dimmed, dragStateRef, onSelect }) {
  // useTexture は読み込み完了まで Suspense で待たせる（呼び出し側が fallback を出す）。
  const texture = useTexture(photo.url);
  const { camera, gl } = useThree();
  const groupRef = useRef(null);
  const photoMaterialRef = useRef(null);
  const frameMaterialRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // TextureLoader は colorSpace を設定しないため、明示しないと写真が
    // 暗く沈んだ色になる（three r152 以降の色管理）。
    texture.colorSpace = SRGBColorSpace;
    // 板を斜めから見る場面が多いので異方性フィルタを最大に。輪郭のにじみが減る。
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
  }, [texture, gl]);

  // 高さを揃えて幅をアスペクト比で決める。縦横が混在しても密度が揃う。
  const [width, height] = useMemo(() => {
    const image = texture.image;
    const aspect = image?.width && image?.height ? image.width / image.height : 1;
    return [CARD_HEIGHT * aspect, CARD_HEIGHT];
  }, [texture]);

  // useFrame は毎フレーム走るので、その中で new しない（GC が効いてカクつく）。
  // 使い回す一時オブジェクトをここで作っておく。
  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      forward: new Vector3(),
      scale: new Vector3(),
      orient: new Object3D(),
      tint: new Color(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const k = followRate(delta, 7);
    const time = state.clock.elapsedTime;

    if (selected) {
      // カメラの前方 SELECTED_DISTANCE の一点へ寄せ、姿勢もカメラに合わせる。
      // カメラを動かす代わりにカードを動かすのは、見回しの状態と拡大の状態が
      // 混ざらないようにするため（PLAN.md の設計判断）。
      scratch.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      scratch.target.copy(camera.position).addScaledVector(scratch.forward, SELECTED_DISTANCE);
      group.position.lerp(scratch.target, k);
      group.quaternion.slerp(camera.quaternion, k);
    } else {
      const [baseX, baseY, baseZ] = layout.position;
      scratch.target.set(
        baseX + Math.cos(time * 0.35 + layout.phase) * FLOAT_AMPLITUDE * 0.6,
        baseY + Math.sin(time * 0.55 + layout.phase) * FLOAT_AMPLITUDE,
        baseZ,
      );
      group.position.lerp(scratch.target, k);

      // 板の表面(+z)を原点にいるカメラへ向ける。
      // three の lookAt が -z をターゲットへ向けるのは camera / light だけで、
      // Mesh や Group は +z がターゲットを向く。カメラは常に原点にいるので、
      // 原点そのものを見させれば表がこちらを向く（外側を見させると裏返る）。
      scratch.orient.position.copy(group.position);
      scratch.orient.lookAt(0, 0, 0);
      group.quaternion.slerp(scratch.orient.quaternion, k);
    }

    const targetScale = selected ? SELECTED_SCALE : hovered ? HOVER_SCALE : 1;
    group.scale.lerp(scratch.scale.setScalar(targetScale), k);

    if (frameMaterialRef.current) {
      const targetOpacity = selected ? 0.95 : hovered ? 0.85 : 0.16;
      frameMaterialRef.current.opacity = MathUtils.lerp(
        frameMaterialRef.current.opacity,
        targetOpacity,
        k,
      );
    }
    if (photoMaterialRef.current) {
      // 他の 1 枚を選んでいる間は暗く落として視線を集める。
      // 不透明度ではなく色を落とすのは、transparent を有効にすると板同士の
      // 描画順が深度ソート任せになり、重なりがちらつくため。
      photoMaterialRef.current.color.lerp(scratch.tint.setScalar(dimmed ? 0.3 : 1), k);
    }
  });

  const handlePointerOver = (event) => {
    // 手前の板で止める。stopPropagation しないと背後の写真も同時にホバーになる。
    event.stopPropagation();
    setHovered(true);
    gl.domElement.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    setHovered(false);
    gl.domElement.style.cursor = '';
  };

  const handleClick = (event) => {
    event.stopPropagation();
    // 見回しドラッグを終えた位置に板があると R3F は click も発火させる。
    // 移動量で「これはドラッグだった」と判定して弾く。
    if (dragStateRef.current?.dragged) return;
    onSelect(selected ? null : photo.id);
  };

  return (
    <group ref={groupRef} position={layout.position}>
      <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick}>
        <planeGeometry args={[width, height]} />
        {/* meshBasicMaterial は照明の影響を受けない。写真の色をそのまま出したいので
            ライティング付きのマテリアルは使わない。 */}
        <meshBasicMaterial ref={photoMaterialRef} map={texture} />
      </mesh>
      {/* 背面のフレーム。少し大きい板を後ろに置き、縁が光って見えるようにする。
          raycast を潰してあるのは、写真より大きい板が当たり判定に混ざるのを避け、
          60 枚 × 2 メッシュ分の交差計算を半分にするため。 */}
      <mesh position={[0, 0, -0.01]} raycast={() => null}>
        <planeGeometry args={[width + FRAME_PADDING, height + FRAME_PADDING]} />
        <meshBasicMaterial ref={frameMaterialRef} color={ACCENT} transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

/** テクスチャ読み込み中に同じ位置へ置く仮の板。 */
export function PlaceholderCard({ layout, broken = false }) {
  const groupRef = useRef(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    // 読み込み中もわずかに揺らす。完全に静止していると「固まった」ように見える。
    const time = state.clock.elapsedTime;
    group.position.y = layout.position[1] + Math.sin(time * 0.55 + layout.phase) * FLOAT_AMPLITUDE;
    // 位置を決めた後に向きを合わせる（順序を逆にすると 1 フレーム遅れる）。
    // 原点 = カメラ位置を向けると表(+z)がこちらを向く（PhotoCard と同じ理由）。
    group.lookAt(0, 0, 0);
  });

  return (
    <group ref={groupRef} position={layout.position}>
      <mesh>
        <planeGeometry args={[CARD_HEIGHT, CARD_HEIGHT]} />
        <meshBasicMaterial
          color={broken ? '#4a2530' : '#1b2330'}
          transparent
          opacity={broken ? 0.7 : 0.45}
        />
      </mesh>
    </group>
  );
}
