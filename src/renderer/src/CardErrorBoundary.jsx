// 写真 1 枚の読み込み失敗を、その 1 枚の中に閉じ込める。
//
// useTexture は読み込み失敗時に例外を投げる。Suspense はこれを捕まえないため、
// ファイルが移動/削除されていた 1 枚のせいでアプリ全体が白画面になる。
// エラー境界は class コンポーネントでしか書けない（Hooks に相当機能が無い）。

import { Component } from 'react';

export class CardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[photo-orb] 写真を読み込めませんでした:', error);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
