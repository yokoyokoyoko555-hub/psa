/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenCV.js（WASM, 約8MB）をクライアントで遅延ロードする。AI測定画面でのみ読み込む。
// 設計: docs/CENTERING_TOOL.md / ADR-0013（端末内自動検出）。

const CV_URL = "https://docs.opencv.org/4.10.0/opencv.js";
let loadPromise: Promise<any> | null = null;

export function loadOpenCv(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<any>((resolve, reject) => {
    const w = window as any;
    if (w.cv && w.cv.Mat) {
      resolve(w.cv);
      return;
    }

    const onReady = () => {
      const cv = w.cv;
      if (!cv) {
        reject(new Error("opencv: cv undefined"));
        return;
      }
      if (cv.Mat) {
        resolve(cv);
      } else if (typeof cv.then === "function") {
        cv.then((m: any) => {
          w.cv = m;
          resolve(m);
        });
      } else {
        cv.onRuntimeInitialized = () => resolve(w.cv);
      }
    };

    const existing = document.getElementById("opencv-js-script");
    if (existing) {
      existing.addEventListener("load", onReady);
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-js-script";
    script.src = CV_URL;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("opencv: script load failed"));
    document.body.appendChild(script);

    setTimeout(() => reject(new Error("opencv: load timeout")), 40000);
  });

  return loadPromise;
}
