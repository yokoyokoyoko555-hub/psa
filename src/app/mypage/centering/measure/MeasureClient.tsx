"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { centeringFromQuads, estimateGrade, formatRatio, type Quad, type Centering } from "@/lib/centering";
import { detectQuads } from "@/lib/centering-detect";
import { saveCenteringMeasurement } from "@/actions/centering";

type Step = "cap-front" | "adj-front" | "cap-back" | "adj-back" | "result";
type Target = "outer" | "inner";
type Corner = keyof Quad;
type Face = "front" | "back";
type QuadPair = { outer: Quad; inner: Quad };

const DEFAULT_OUTER: Quad = {
  tl: { x: 0.1, y: 0.08 }, tr: { x: 0.9, y: 0.08 },
  br: { x: 0.9, y: 0.92 }, bl: { x: 0.1, y: 0.92 },
};
const DEFAULT_INNER: Quad = {
  tl: { x: 0.22, y: 0.18 }, tr: { x: 0.78, y: 0.18 },
  br: { x: 0.78, y: 0.82 }, bl: { x: 0.22, y: 0.82 },
};
const OUTER_COLOR = "#185FA5";
const INNER_COLOR = "#BA7517";
const CORNERS: Corner[] = ["tl", "tr", "br", "bl"];

export default function MeasureClient({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("cap-front");
  const [target, setTarget] = useState<Target>("outer");

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ target: Target; corner: Corner } | null>(null);
  const detectId = useRef(0);

  const [camError, setCamError] = useState(false);
  const [frontImg, setFrontImg] = useState<string | null>(null);
  const [backImg, setBackImg] = useState<string | null>(null);
  const [front, setFront] = useState<Centering | null>(null);
  const [back, setBack] = useState<Centering | null>(null);

  const [outer, setOuter] = useState<Quad>(DEFAULT_OUTER);
  const [inner, setInner] = useState<Quad>(DEFAULT_INNER);
  const [loupe, setLoupe] = useState<{ nx: number; ny: number; w: number; h: number } | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // AI自動検出（aiEnabled時のみ）
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");
  const [usedAi, setUsedAi] = useState(false);

  // ①補正テレメトリ（AI提案値 / 確定値。画像は保存しない）
  const [frontProposed, setFrontProposed] = useState<QuadPair | null>(null);
  const [backProposed, setBackProposed] = useState<QuadPair | null>(null);
  const [frontFinal, setFrontFinal] = useState<QuadPair | null>(null);
  const [backFinal, setBackFinal] = useState<QuadPair | null>(null);

  const capturing = step === "cap-front" || step === "cap-back";
  const adjusting = step === "adj-front" || step === "adj-back";
  const curImg = step === "adj-front" ? frontImg : backImg;

  useEffect(() => {
    if (!capturing) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        setCamError(false);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setCamError(true));
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [capturing, step]);

  function startAdjust() {
    setOuter(DEFAULT_OUTER);
    setInner(DEFAULT_INNER);
    setTarget("outer");
  }

  function runDetect(url: string, face: Face) {
    const myId = ++detectId.current;
    setDetecting(true);
    setDetectMsg("AIエンジンを準備中…（初回は数秒かかります）");
    const img = new Image();
    img.onload = async () => {
      try {
        const res = await detectQuads(img);
        if (detectId.current !== myId) return; // キャンセル/再実行済み
        if (res) {
          setOuter(res.outer);
          setInner(res.inner);
          setUsedAi(true);
          const pair = { outer: res.outer, inner: res.inner };
          if (face === "front") setFrontProposed(pair);
          else setBackProposed(pair);
          setDetectMsg("AIが枠を検出しました。ズレていれば微調整してください。");
        } else {
          setDetectMsg("自動検出できませんでした。手動で合わせてください。");
        }
      } catch (e) {
        if (detectId.current !== myId) return;
        setDetectMsg(
          "自動検出に失敗しました（" + (e instanceof Error ? e.message : "不明") + "）。手動で合わせてください。",
        );
      } finally {
        if (detectId.current === myId) setDetecting(false);
      }
    };
    img.onerror = () => {
      if (detectId.current !== myId) return;
      setDetecting(false);
      setDetectMsg("画像の読み込みに失敗しました。");
    };
    img.src = url;
  }

  function cancelDetect() {
    detectId.current++;
    setDetecting(false);
    setDetectMsg("手動で合わせてください。");
  }

  function acceptImage(url: string) {
    const face: Face = step === "cap-front" ? "front" : "back";
    if (face === "front") {
      setFrontImg(url);
      setStep("adj-front");
    } else {
      setBackImg(url);
      setStep("adj-back");
    }
    startAdjust();
    setDetectMsg("");
    if (aiEnabled) runDetect(url, face);
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    acceptImage(c.toDataURL("image/jpeg", 0.92));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => acceptImage(reader.result as string);
    reader.readAsDataURL(f);
  }

  function setCorner(t: Target, corner: Corner, x: number, y: number) {
    const setter = t === "outer" ? setOuter : setInner;
    setter((prev) => ({ ...prev, [corner]: { x, y } }));
  }

  function onMove(e: PointerEvent) {
    const a = active.current;
    const cont = containerRef.current;
    if (!a || !cont) return;
    const r = cont.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    setCorner(a.target, a.corner, nx, ny);
    setLoupe({ nx, ny, w: r.width, h: r.height });
  }

  function endDrag() {
    active.current = null;
    setLoupe(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }

  function startCornerDrag(corner: Corner) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      active.current = { target, corner };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", endDrag);
    };
  }

  function confirmStep() {
    if (target === "outer") {
      setTarget("inner");
      return;
    }
    const finalPair = { outer, inner };
    const cen = centeringFromQuads(outer, inner);
    if (step === "adj-front") {
      setFrontFinal(finalPair);
      setFront(cen);
      setStep("cap-back");
    } else {
      setBackFinal(finalPair);
      setBack(cen);
      setStep("result");
    }
  }

  async function save() {
    if (!front) return;
    const grade = estimateGrade(front, back);
    setSaving(true);
    setError("");
    const detectionSample = {
      front: frontFinal ? { proposed: frontProposed, final: frontFinal } : null,
      back: backFinal ? { proposed: backProposed, final: backFinal } : null,
    };
    const res = await saveCenteringMeasurement({
      method: usedAi ? "AI" : "MANUAL",
      frontLR: front.lr,
      frontTB: front.tb,
      backLR: back?.lr,
      backTB: back?.tb,
      estimatedGrade: grade,
      detectionSample,
    });
    setSaving(false);
    if (res.success && res.id) router.push(`/mypage/centering/${res.id}`);
    else setError(res.error ?? "保存に失敗しました");
  }

  function restart() {
    setFront(null);
    setBack(null);
    setFrontImg(null);
    setBackImg(null);
    setUsedAi(false);
    setDetectMsg("");
    setFrontProposed(null);
    setBackProposed(null);
    setFrontFinal(null);
    setBackFinal(null);
    startAdjust();
    setStep("cap-front");
  }

  // ===== 撮影 =====
  if (capturing) {
    const isFront = step === "cap-front";
    return (
      <div className="space-y-4">
        <StepBadge step={step} />
        <p className="text-center text-sm text-gray-600">{isFront ? "表面" : "裏面"}を枠に合わせて撮影してください</p>
        {aiEnabled && (
          <p className="text-center text-xs text-brand-600">✨ AIプラン有効：撮影後にAIが枠を自動検出します</p>
        )}
        {camError ? (
          <div className="space-y-3">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-sm">
              カメラを起動できませんでした。画像ファイルを選択して測定できます。
            </div>
            <FileButton onFile={onFile} />
          </div>
        ) : (
          <>
            <div className="relative bg-black rounded-xl overflow-hidden h-[52vh] max-h-[520px] flex items-center justify-center">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="border-2 border-dashed border-white/70 rounded-lg" style={{ width: "62%", height: "82%" }} />
              </div>
              <p className="absolute top-3 left-0 right-0 text-center text-white/85 text-xs">白/黒の紙の上・真上から・反射に注意</p>
            </div>
            <div className="flex items-center justify-center gap-6">
              {step === "cap-back" && (
                <button onClick={() => setStep("result")} className="text-sm text-gray-500 hover:text-gray-700">
                  裏面をスキップ
                </button>
              )}
              <button onClick={capture} aria-label="撮影" className="w-16 h-16 rounded-full border-4 border-brand-600 flex items-center justify-center">
                <span className="w-11 h-11 rounded-full bg-brand-600 block" />
              </button>
            </div>
            <FileButton onFile={onFile} />
            <p className="text-center text-xs text-gray-400">
              撮影のほか、保存済みの画像から取り込んで測定できます{aiEnabled ? "（取り込み後にAIが自動検出）" : ""}
            </p>
          </>
        )}
      </div>
    );
  }

  // ===== ガイド四隅補正（外周→内枠の2ステップ）=====
  if (adjusting) {
    const color = target === "outer" ? OUTER_COLOR : INNER_COLOR;
    const curQuad = target === "outer" ? outer : inner;
    const Z = 2.6;
    const LO = 120;
    return (
      <div className="space-y-4">
        <StepBadge step={step} />
        <div className="text-center space-y-1">
          <p className="text-sm font-bold" style={{ color }}>
            {target === "outer" ? "① 外周（カードの縁）" : "② 内枠（絵柄・フレームの縁）"}
          </p>
          <p className="text-xs text-gray-500">4つの隅を実際のカードの角にドラッグして合わせてください</p>
          {detectMsg && <p className="text-xs text-brand-600">{detectMsg}</p>}
        </div>

        <div
          ref={containerRef}
          className="relative w-full select-none rounded-xl overflow-hidden bg-gray-100"
          style={{ touchAction: "none" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {curImg && <img src={curImg} alt="撮影画像" className="block w-full" draggable={false} />}

          <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
            <polygon points={quadPoints(outer)} fill="none" stroke={OUTER_COLOR} strokeWidth={target === "outer" ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" opacity={target === "outer" ? 1 : 0.4} />
            <polygon points={quadPoints(inner)} fill="none" stroke={INNER_COLOR} strokeWidth={target === "inner" ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" opacity={target === "inner" ? 1 : 0.4} />
          </svg>

          {CORNERS.map((corner) => (
            <div
              key={corner}
              onPointerDown={startCornerDrag(corner)}
              style={{
                position: "absolute",
                left: `${curQuad[corner].x * 100}%`,
                top: `${curQuad[corner].y * 100}%`,
                width: 34,
                height: 34,
                marginLeft: -17,
                marginTop: -17,
                borderRadius: "50%",
                background: target === "outer" ? "rgba(24,95,165,0.35)" : "rgba(186,117,23,0.4)",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                touchAction: "none",
                zIndex: 5,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            </div>
          ))}

          {loupe && curImg && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: loupe.nx > 0.5 ? 10 : "auto",
                right: loupe.nx > 0.5 ? "auto" : 10,
                width: LO,
                height: LO,
                borderRadius: "50%",
                border: "2px solid #fff",
                boxShadow: "0 1px 6px rgba(0,0,0,0.4)",
                backgroundImage: `url(${curImg})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${loupe.w * Z}px ${loupe.h * Z}px`,
                backgroundPosition: `${-(loupe.nx * loupe.w * Z - LO / 2)}px ${-(loupe.ny * loupe.h * Z - LO / 2)}px`,
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: color, opacity: 0.8 }} />
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: color, opacity: 0.8 }} />
            </div>
          )}

          {detecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50">
              <span className="text-white text-sm font-bold">✨ AIで検出中...</span>
              <button
                onClick={cancelDetect}
                className="border border-white/70 text-white rounded-lg px-4 py-2 text-sm hover:bg-white/10"
              >
                手動で合わせる
              </button>
            </div>
          )}
        </div>

        {aiEnabled && (
          <button
            onClick={() => curImg && runDetect(curImg, step === "adj-front" ? "front" : "back")}
            disabled={detecting}
            className="w-full border border-brand-300 text-brand-700 rounded-lg py-2 text-sm hover:bg-brand-50 disabled:opacity-50"
          >
            ✨ AIで自動検出{usedAi ? "し直す" : ""}
          </button>
        )}

        <div className="flex gap-3">
          {target === "inner" ? (
            <button onClick={() => setTarget("outer")} className="flex-1 border border-gray-300 rounded-lg py-3 text-sm text-gray-700 hover:bg-gray-50">
              ← 外周へ戻る
            </button>
          ) : (
            <button onClick={() => setStep(step === "adj-front" ? "cap-front" : "cap-back")} className="flex-1 border border-gray-300 rounded-lg py-3 text-sm text-gray-700 hover:bg-gray-50">
              撮り直す
            </button>
          )}
          <button onClick={confirmStep} className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700">
            {target === "outer" ? "次へ（内枠）" : step === "adj-front" ? "確定して裏面へ" : "確定して測定"}
          </button>
        </div>
      </div>
    );
  }

  // ===== 結果 =====
  const grade = front ? estimateGrade(front, back) : "—";
  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div className="text-center">
          <p className="text-sm text-gray-500">参考上限グレード</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            PSA {grade} <span className="text-base font-normal text-gray-400">相当</span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ResultRow label="表面" cen={front} />
          <ResultRow label="裏面" cen={back} />
        </div>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3 text-xs leading-relaxed">
          ⚠️ 本測定は参考値であり、PSA等の鑑定会社による公式判定を保証するものではありません。
        </div>
      </div>

      <Link href="/apply" className="block bg-brand-600 text-white rounded-2xl p-5 hover:bg-brand-700 transition">
        <p className="font-bold">📨 このカードをPSA鑑定に申し込む</p>
        <p className="text-sm text-white/80 mt-1">トレカビンクスがPSA提出を代行します。センタリングが良ければ高グレードのチャンス。</p>
      </Link>

      <div className="flex gap-3">
        <button onClick={restart} className="flex-1 border border-gray-300 rounded-lg py-3 text-sm text-gray-700 hover:bg-gray-50">
          もう一度
        </button>
        <button onClick={save} disabled={saving || !front} className="flex-1 border-2 border-brand-600 text-brand-700 font-bold py-3 rounded-lg hover:bg-brand-50 disabled:opacity-50">
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}

function quadPoints(q: Quad): string {
  return `${q.tl.x},${q.tl.y} ${q.tr.x},${q.tr.y} ${q.br.x},${q.br.y} ${q.bl.x},${q.bl.y}`;
}

function StepBadge({ step }: { step: Step }) {
  const isFront = step === "cap-front" || step === "adj-front";
  return (
    <div className="flex justify-center">
      <span className="text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
        {isFront ? "表面 1 / 2" : "裏面 2 / 2"}
      </span>
    </div>
  );
}

function FileButton({ onFile }: { onFile: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block text-center w-full border border-gray-300 rounded-lg py-3 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
      🖼 画像から取り込む
      <input type="file" accept="image/*" onChange={onFile} className="hidden" />
    </label>
  );
}

function ResultRow({ label, cen }: { label: string; cen: Centering | null }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      {!cen ? (
        <p className="text-gray-400 text-sm">未測定</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-400">左右</p>
            <p className="text-xl font-bold text-gray-900">{formatRatio(cen.lr)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">上下</p>
            <p className="text-xl font-bold text-gray-900">{formatRatio(cen.tb)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
