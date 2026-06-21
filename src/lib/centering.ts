// センタリング測定の純粋ロジック（DB/環境非依存・テスト容易）。
// 設計: docs/CENTERING_TOOL.md / ADR-0012。結果は参考値であり鑑定会社の判定を保証しない。

export type Pt = { x: number; y: number };
/** 四隅（画像に対する 0..1 比率）。遠近で台形になったカードを表現できる */
export type Quad = { tl: Pt; tr: Pt; br: Pt; bl: Pt };

export type Centering = { lr: number; tb: number };

/** 片方向のセンタリング（大きい側の割合%）。例: 左0.30/右0.20 → 60 */
export function ratioPercent(a: number, b: number): number {
  const total = a + b;
  if (total <= 0) return 50;
  const big = Math.max(a, b);
  return Math.round((big / total) * 100);
}

// 8x8 線形方程式をガウス消去（部分ピボット）で解く
function solve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col] || 1e-9;
    for (let c = col; c <= n; c++) m[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

// 四隅(quad)を単位正方形(0,0)-(1,1)に写すホモグラフィ係数 [h11..h32]（h33=1）
function homographyToUnit(q: Quad): number[] {
  const src = [q.tl, q.tr, q.br, q.bl];
  const dst = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }
  return solve8(A, b);
}

function applyH(h: number[], p: Pt): Pt {
  const d = h[6] * p.x + h[7] * p.y + 1 || 1e-9;
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / d,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / d,
  };
}

/**
 * 外周(outer)と内枠(inner)の四隅からセンタリングを算出。
 * outer を単位正方形へ透視補正し、inner を同じ変換で正規化してから余白を比較する。
 * これにより斜め（台形）に写ったカードでも正しく測定できる。
 */
export function centeringFromQuads(outer: Quad, inner: Quad): Centering {
  const h = homographyToUnit(outer);
  const i = {
    tl: applyH(h, inner.tl),
    tr: applyH(h, inner.tr),
    br: applyH(h, inner.br),
    bl: applyH(h, inner.bl),
  };
  const left = Math.max(0, (i.tl.x + i.bl.x) / 2);
  const right = Math.max(0, 1 - (i.tr.x + i.br.x) / 2);
  const top = Math.max(0, (i.tl.y + i.tr.y) / 2);
  const bottom = Math.max(0, 1 - (i.bl.y + i.br.y) / 2);
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
