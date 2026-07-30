import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sphereLayout } from '../src/renderer/src/sphere-layout.mjs';

const distanceFromOrigin = ([x, y, z]) => Math.sqrt(x * x + y * y + z * z);

test('枚数が 0 以下なら空配列', () => {
  assert.deepEqual(sphereLayout(0), []);
  assert.deepEqual(sphereLayout(-3), []);
  assert.deepEqual(sphereLayout(Number.NaN), []);
});

test('1 枚のときは正面（カメラ既定の向き -z）に置く', () => {
  const [point] = sphereLayout(1, { radius: 5 });
  assert.deepEqual(point.position, [0, 0, -5]);
});

test('すべての点が半径 radius の球面上に乗る', () => {
  const radius = 7;
  for (const point of sphereLayout(60, { radius })) {
    // yLimit を掛けても球面上に留まることの確認（極を避ける実装の要）
    assert.ok(
      Math.abs(distanceFromOrigin(point.position) - radius) < 1e-9,
      `半径が ${distanceFromOrigin(point.position)} になっている`,
    );
  }
});

test('yLimit で真上・真下を避ける', () => {
  const radius = 6;
  const yLimit = 0.8;
  const ys = sphereLayout(40, { radius, yLimit }).map(({ position }) => position[1]);
  assert.ok(Math.max(...ys) <= radius * yLimit + 1e-9);
  assert.ok(Math.min(...ys) >= -radius * yLimit - 1e-9);
});

test('乱数を使わないので毎回同じ配置になる', () => {
  assert.deepEqual(sphereLayout(25, { radius: 6 }), sphereLayout(25, { radius: 6 }));
});

test('写真同士が重ならない間隔が空く', () => {
  // 板の高さは 1.5。60 枚を半径 7 に並べたとき、最近接距離がこれを下回ると
  // 明らかに重なって見える。黄金角配置が密集を作らないことの回帰テスト。
  const points = sphereLayout(60, { radius: 7 }).map(({ position }) => position);
  let minDistance = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      const dz = points[i][2] - points[j][2];
      minDistance = Math.min(minDistance, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  assert.ok(minDistance > 1.5, `最近接距離が ${minDistance.toFixed(3)} しかない`);
});

test('位相は 0..2π に収まり、隣同士で同じ値にならない', () => {
  const phases = sphereLayout(12).map(({ phase }) => phase);
  for (const phase of phases) {
    assert.ok(phase >= 0 && phase < Math.PI * 2);
  }
  assert.equal(new Set(phases).size, phases.length);
});
