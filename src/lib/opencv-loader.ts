/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenCV.js（WASM, 約8MB）をクライアントで遅延ロードする。AI測定画面でのみ読み込む。
// docs版は build差で cv が「Moduleオブジェクト / Promise / ファクトリ関数」のいずれかになるため全対応。
// 設計: docs/CENTERING_TOOL.md / ADR-0013（端末内自動検出）。

const CV_URL = "https://docs.opencv.org/4.x/opencv.js";
const TIMEOUT_MS = 60000;
let loadPromise: Promise<any> | null = null;

export function loadOpenCv(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<any>((resolve, reject) => {
    const w = window as any;
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      pollTimer = null;
      timeoutTimer = null;
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      loadPromise = null;
      reject(err);
    };

    const ready = (c: any): boolean => {
      if (settled) return true;
      if (c && c.Mat) {
        settled = true;
        cleanup();
        w.cv = c;
        resolve(c);
        return true;
      }
      return false;
    };

    // 既にロード済み
    if (ready(w.cv)) return;

    const handleLoaded = async () => {
      try {
        let c = w.cv;
        if (!c) {
          fail(new Error("opencv: cv undefined after load"));
          return;
        }
        // Promise形式 / ファクトリ関数形式を一度だけ解決
        if (typeof c.then === "function") c = await Promise.race([c, timeout()]);
        else if (typeof c === "function") c = await Promise.race([c(), timeout()]);

        if (ready(c)) return;

        // Module形式: 初期化完了を待つ（コールバック＋ポーリングの二段構え）
        c.onRuntimeInitialized = () => ready(c);
        const start = Date.now();
        pollTimer = setInterval(() => {
          if (ready(c)) {
            cleanup();
          } else if (Date.now() - start > TIMEOUT_MS) {
            fail(new Error("opencv: init timeout"));
          }
        }, 200);
      } catch (e) {
        fail(e instanceof Error ? e : new Error("opencv: init failed"));
      }
    };

    const timeout = () =>
      new Promise<never>((_, rejectTimeout) => {
        timeoutTimer = setTimeout(() => rejectTimeout(new Error("opencv: load timeout")), TIMEOUT_MS);
      });

    const existing = document.getElementById("opencv-js-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", handleLoaded);
      // 既にloadイベントを過ぎている可能性に備えて即時試行
      void handleLoaded();
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-js-script";
    script.src = CV_URL;
    script.async = true;
    script.onload = handleLoaded;
    script.onerror = () => fail(new Error("opencv: script load failed"));
    document.body.appendChild(script);

    timeoutTimer = setTimeout(() => fail(new Error("opencv: load timeout")), TIMEOUT_MS);
  });

  return loadPromise;
}
