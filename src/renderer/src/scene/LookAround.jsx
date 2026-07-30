// 一人称の見回しコントロール。
//
// drei の OrbitControls を使わない理由: OrbitControls は「target の周りを回る」
// ため、カメラが原点にいる（写真に囲まれている）構図では回転の軸が作れない。
// ここで必要なのは「その場で首を振る」操作なので、yaw/pitch を直接持つ方が
// 素直で、ホイールに別の意味（球の半径 = 写真までの距離）を割り当てられる。

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils } from 'three';

const DRAG_SENSITIVITY = 0.0032; // rad / px
const PITCH_LIMIT = 1.2; // ±約 69°。真上・真下まで向くと方向感覚を失う
const DRAG_THRESHOLD = 5; // px。これを超えたら「クリックではなくドラッグ」
const WHEEL_STEP = 0.7;

export const MIN_RADIUS = 3.6;
export const MAX_RADIUS = 13;

export function LookAround({ enabled, dragStateRef, onRadiusChange }) {
  const { camera, gl } = useThree();
  const angles = useRef({ yaw: 0, pitch: 0 }); // 実際のカメラ角（滑らかに追従する側）
  const desired = useRef({ yaw: 0, pitch: 0 }); // 入力で即座に動く目標角
  // enabled を直接 useEffect の依存に入れるとリスナが張り直しになり、
  // ドラッグ中に選択が起きた瞬間に pointer capture を失う。ref で参照する。
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    // Euler の適用順を YXZ にする。既定の XYZ だと yaw を足すたびに
    // 視界が傾いていく（ロールが混入する）。
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    const element = gl.domElement;
    const dragState = dragStateRef.current;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;

    const handlePointerDown = (event) => {
      if (event.button !== 0) return;
      dragState.dragging = true;
      dragState.dragged = false;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      // capture しておくと、ウィンドウ端まで振り切っても回転が続く。
      element.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event) => {
      if (!dragState.dragging) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > DRAG_THRESHOLD) {
        dragState.dragged = true;
      }
      if (!enabledRef.current) return;
      desired.current.yaw -= deltaX * DRAG_SENSITIVITY;
      desired.current.pitch = MathUtils.clamp(
        desired.current.pitch - deltaY * DRAG_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    };

    const handlePointerUp = (event) => {
      dragState.dragging = false;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    const handleWheel = (event) => {
      // passive: false で登録しているので preventDefault が効く。
      // これが無いと Chromium 側のページズームが割り込む。
      event.preventDefault();
      if (!enabledRef.current) return;
      onRadiusChange((current) =>
        MathUtils.clamp(current + Math.sign(event.deltaY) * WHEEL_STEP, MIN_RADIUS, MAX_RADIUS),
      );
    };

    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('pointercancel', handlePointerUp);
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerUp);
      element.removeEventListener('wheel', handleWheel);
    };
  }, [gl, dragStateRef, onRadiusChange]);

  useFrame((state, delta) => {
    // 目標角へ指数的に追従させる。入力をそのままカメラに入れるとカクつくため。
    const k = 1 - Math.exp(-12 * delta);
    angles.current.yaw = MathUtils.lerp(angles.current.yaw, desired.current.yaw, k);
    angles.current.pitch = MathUtils.lerp(angles.current.pitch, desired.current.pitch, k);
    camera.rotation.set(angles.current.pitch, angles.current.yaw, 0);
  });

  return null;
}
