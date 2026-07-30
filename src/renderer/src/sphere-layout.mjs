// 写真を球殻上に均等配置する計算。3D シーンから切り離した純関数。
//
// シーンの中に計算を埋め込むと、配置の調整が「起動して目で見る」しか
// できなくなる。ここに閉じておけば node --test で検証できる。
// 拡張子 .mjs はテストから直接 import するため（src/main/photo-library.mjs と同じ規約）。

// 黄金角。2π × (1 - 1/φ) ≈ 137.5°
// 円周をこの角度で刻むと、何周しても同じ方位に戻らないため点が重ならない。
// ひまわりの種の並び（葉序）と同じ原理。
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Fibonacci sphere で count 個の座標を返す。
 *
 * 緯度経度を等分割する素朴な方法だと極付近が密集する（メルカトル図法と同じ歪み）。
 * y を -1..1 に等間隔で取ると球帯の面積が等しくなるので、密度が揃う。
 *
 * @param count 個数
 * @param radius 球の半径（カメラは原点にいるので、これが「写真までの距離」）
 * @param yLimit 真上・真下を避ける係数(0..1)。1 だと極に写真が来て見上げ/見下ろしが要る
 * @returns [{ position: [x,y,z], phase }] — phase は浮遊アニメの初期位相
 */
export function sphereLayout(count, { radius = 6, yLimit = 0.85 } = {}) {
  if (!Number.isFinite(count) || count <= 0) return [];
  // 1 枚のときは 0 除算になるので、正面（カメラ既定の向き -z）に置く。
  if (count === 1) return [{ position: [0, 0, -radius], phase: 0 }];

  const points = [];
  for (let i = 0; i < count; i += 1) {
    // y を等間隔に。yLimit を掛けても x²+y²+z² = radius² は保たれる
    // （r を残りの成分から求めているため、点は必ず球面上に乗る）。
    const y = (1 - (2 * i) / (count - 1)) * yLimit;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    points.push({
      position: [
        Math.cos(theta) * ringRadius * radius,
        y * radius,
        Math.sin(theta) * ringRadius * radius,
      ],
      // 位相も i から決定的に作る。乱数を使うと再描画で揺れ方が変わってしまう。
      phase: (i * GOLDEN_ANGLE) % (Math.PI * 2),
    });
  }
  return points;
}
