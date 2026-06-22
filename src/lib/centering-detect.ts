/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenCV.js によるカード枠の自動検出（端末内）。外周＝最大の四角輪郭、内枠＝外周と同心で
// 一回り小さい四角輪郭。検出失敗時は null を返し、呼び出し側は手動既定値にフォールバックする。
// 設計: docs/CENTERING_TOOL.md / ADR-0013。

import { loadOpenCv } from "./opencv-loader";
import type { Quad, Pt } from "./centering";

const MAX_DIM = 1200; // 処理用の最大辺（速度のため縮小）

function order(pts: Pt[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  return { tl: bySum[0], br: bySum[3], bl: byDiff[0], tr: byDiff[3] };
}

function normQuad(q: Quad, w: number, h: number): Quad {
  const n = (p: Pt): Pt => ({
    x: Math.max(0, Math.min(1, p.x / w)),
    y: Math.max(0, Math.min(1, p.y / h)),
  });
  return { tl: n(q.tl), tr: n(q.tr), br: n(q.br), bl: n(q.bl) };
}

function insetNorm(q: Quad, f: number): Quad {
  const cx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
  const cy = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
  const m = (p: Pt): Pt => ({ x: p.x + (cx - p.x) * f, y: p.y + (cy - p.y) * f });
  return { tl: m(q.tl), tr: m(q.tr), br: m(q.br), bl: m(q.bl) };
}

function centroid(cv: any, c: any): Pt {
  const mm = cv.moments(c);
  if (!mm.m00) return { x: 0, y: 0 };
  return { x: mm.m10 / mm.m00, y: mm.m01 / mm.m00 };
}

// 輪郭を4点に近似（取れなければ外接矩形でフォールバック）。画像px座標で返す。
function approxQuad(cv: any, contour: any): Pt[] {
  const approx = new cv.Mat();
  try {
    const peri = cv.arcLength(contour, true);
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);
    if (approx.rows === 4) {
      const pts: Pt[] = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
      }
      return pts;
    }
  } finally {
    approx.delete();
  }
  const r = cv.boundingRect(contour);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

async function toScaledCanvas(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * 画像から外周・内枠の四隅（正規化 0..1）を検出。失敗時 null。
 */
export async function detectQuads(img: HTMLImageElement): Promise<{ outer: Quad; inner: Quad } | null> {
  const cv = await loadOpenCv();
  const canvas = await toScaledCanvas(img);
  const W = canvas.width;
  const H = canvas.height;

  const got: any[] = [];
  let src: any, gray: any, blur: any, edges: any, kernel: any, contours: any, hierarchy: any;
  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    edges = new cv.Mat();
    cv.Canny(blur, edges, 60, 180);
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = W * H;
    const items: { c: any; area: number }[] = [];
    let outerC: any = null;
    let outerArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      got.push(c);
      const area = cv.contourArea(c);
      items.push({ c, area });
      if (area > outerArea && area < imgArea * 0.99) {
        outerArea = area;
        outerC = c;
      }
    }

    if (!outerC || outerArea < imgArea * 0.15) return null;

    const oc = centroid(cv, outerC);
    let innerC: any = null;
    let innerArea = 0;
    const maxDist = Math.sqrt(imgArea) * 0.18;
    for (const { c, area } of items) {
      if (area < outerArea * 0.2 || area > outerArea * 0.92) continue;
      const cc = centroid(cv, c);
      if (Math.hypot(cc.x - oc.x, cc.y - oc.y) > maxDist) continue;
      if (area > innerArea) {
        innerArea = area;
        innerC = c;
      }
    }

    const outer = normQuad(order(approxQuad(cv, outerC)), W, H);
    const inner = innerC ? normQuad(order(approxQuad(cv, innerC)), W, H) : insetNorm(outer, 0.12);
    return { outer, inner };
  } catch {
    return null;
  } finally {
    got.forEach((c) => c.delete());
    src?.delete();
    gray?.delete();
    blur?.delete();
    edges?.delete();
    kernel?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
}
