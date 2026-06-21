// センタリング測定の純粋ロジック（DB/環境非依存・テスト容易）。
// 設計: docs/CENTERING_TOOL.md / ADR-0012。結果は参考値であり鑑定会社の判定を保証しない。

/** 正規化された矩形（画像に対する 0..1 の比率で各辺位置を持つ） */
export type NormRect = { l: number; r: number; t: number; b: number };

/** 片方向のセンタリング（大きい側の割合%）。例: 左0.30/右0.20 → 60 */
export function ratioPercent(a: number, b: number): number {
  const total = a + b;
  if (total <= 0) return 50;
  const big = Math.max(a, b);
  return Math.round((big / total) * 100);
}

export type Centering = { lr: number; tb: number };

/** 外周(outer)と内枠(inner)の矩形から 左右(lr)・上下(tb) の割合を算出 */
export function centeringFromRects(outer: NormRect, inner: NormRect): Centering {
  const left = Math.max(0, inner.l - outer.l);
  const right = Math.max(0, outer.r - inner.r);
  const top = Math.max(0, inner.t - outer.t);
  const bottom = Math.max(0, outer.b - inner.b);
  return { lr: ratioPercent(left, right), tb: ratioPercent(top, bottom) };
}

// 参考グレード対応表（大きい側の割合 以下なら そのグレード）。あくまで目安。
const FRONT_TABLE: [number, number][] = [
  [55, 10],
  [60, 9],
  [65, 8],
  [70, 7],
  [75, 6],
  [80, 5],
];
const BACK_TABLE: [number, number][] = [
  [75, 10],
  [90, 9],
  [95, 8],
  [100, 7],
];

function gradeByTable(worstPercent: number, table: [number, number][]): number {
  for (const [threshold, grade] of table) {
    if (worstPercent <= threshold) return grade;
  }
  return 4; // 表の最下限を超える＝それ以下
}

/** フロントのみ/フロント+バックから参考上限グレードを推定（厳しい方を採用） */
export function estimateGrade(front: Centering, back?: Centering | null): string {
  const gFront = gradeByTable(Math.max(front.lr, front.tb), FRONT_TABLE);
  if (!back) return String(gFront);
  const gBack = gradeByTable(Math.max(back.lr, back.tb), BACK_TABLE);
  return String(Math.min(gFront, gBack));
}

/** 表示用: 大きい側の割合(58)から "58/42" 文字列を作る */
export function formatRatio(bigPercent: number): string {
  return `${bigPercent}/${100 - bigPercent}`;
}
