"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { centeringFromRects, estimateGrade, formatRatio, type NormRect, type Centering } from "@/lib/centering";
import { saveCenteringMeasurement } from "@/actions/centering";

type Step = "cap-front" | "adj-front" | "cap-back" | "adj-back" | "result";

const DEFAULT_OUTER: NormRect = { l: 0.08, r: 0.92, t: 0.06, b: 0.94 };
const DEFAULT_INNER: NormRect = { l: 0.2, r: 0.8, t: 0.18, b: 0.82 };
const OUTER_COLOR = "#185FA5";
const INNER_COLOR = "#BA7517";

export default function MeasureClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("cap-front");

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ rect: "outer" | "inner"; edge: keyof NormRect } | null>(null);

  const [camError, setCamError] = useState(false);
  const [frontImg, setFrontImg] = useState<string | null>(null);
  const [backImg, setBackImg] = useState<string | null>(null);
  const [front, setFront] = useState<Centering | null>(null);
  const [back, setBack] = useState<Centering | null>(null);

  const [outer, setOuter] = useState<NormRect>(DEFAULT_OUTER);
  const [inner, setInner] = useState<NormRect>(DEFAULT_INNER);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const capturing = step === "cap-front" || step === "cap-back";

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

  function resetRects() {
    setOuter(DEFAULT_OUTER);
    setInner(DEFAULT_INNER);
  }

  function acceptImage(url: string) {
    if (step === "cap-front") {
      setFrontImg(url);
      resetRects();
      setStep("adj-front");
    } else {
      setBackImg(url);
      resetRects();
      setStep("adj-back");
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    acceptImage(c.toDataURL("image/jpeg", 0.9));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => acceptImage(reader.result as string);
    reader.readAsDataURL(f);
  }

  function updateEdge(rectName: "outer" | "inner", edge: keyof NormRect, n: number) {
    const setter = rectName === "outer" ? setOuter : setInner;
    setter((prev) => {
      const min = 0.04;
      const next = { ...prev };
      if (edge === "l") next.l = Math.min(n, prev.r - min);
      else if (edge === "r") next.r = Math.max(n, prev.l + min);
      else if (edge === "t") next.t = Math.min(n, prev.b - min);
      else next.b = Math.max(n, prev.t + min);
      return next;
    });
  }

  function onMove(e: PointerEvent) {
    const a = active.current;
    const cont = containerRef.current;
    if (!a || !cont) return;
    const r = cont.getBoundingClientRect();
    const horiz = a.edge === "l" || a.edge === "r";
    const n = horiz ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    updateEdge(a.rect, a.edge, Math.max(0, Math.min(1, n)));
  }

  function endDrag() {
    active.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }

  function startDrag(rect: "outer" | "inner", edge: keyof NormRect) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      active.current = { rect, edge };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", endDrag);
    };
  }

  function confirmAdjust() {
    const cen = centeringFromRects(outer, inner);
    if (step === "adj-front") {
      setFront(cen);
      setStep("cap-back");
    } else {
      setBack(cen);
      setStep("result");
    }
  }

  async function save() {
    if (!front) return;
    const grade = estimateGrade(front, back);
    setSaving(true);
    setError("");
    const res = await saveCenteringMeasurement({
      frontLR: front.lr,
      frontTB: front.tb,
      backLR: back?.lr,
      backTB: back?.tb,
      estimatedGrade: grade,
    });
    setSaving(false);
    if (res.success && res.id) {
      router.push(`/mypage/centering/${res.id}`);
    } else {
      setError(res.error ?? "保存に失敗しました");
    }
  }

  function restart() {
    setFront(null);
    setBack(null);
    setFrontImg(null);
    setBackImg(null);
    resetRects();
    setStep("cap-front");
  }

  // ===== 撮影 =====
  if (capturing) {
    const isFront = step === "cap-front";
    return (
      <div className="space-y-4">
        <StepBadge step={step} />
        <p className="text-center text-sm text-gray-600">
          {isFront ? "表面" : "裏面"}を枠に合わせて撮影してください
        </p>

        {camError ? (
          <div className="space-y-3">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-sm">
              カメラを起動できませんでした。画像ファイルを選択して測定できます。
            </div>
            <FileButton onFile={onFile} />
          </div>
        ) : (
          <>
            <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4] flex items-center justify-center">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="border-2 border-dashed border-white/70 rounded-lg" style={{ width: "62%", height: "82%" }} />
              </div>
              <p className="absolute top-3 left-0 right-0 text-center text-white/85 text-xs">
                白/黒の紙の上・真上から
              </p>
            </div>
            <div className="flex items-center justify-center gap-6">
              {step === "cap-back" && (
                <button onClick={() => setStep("result")} className="text-sm text-gray-500 hover:text-gray-700">
                  裏面をスキップ
                </button>
              )}
              <button
                onClick={capture}
                aria-label="撮影"
                className="w-16 h-16 rounded-full border-4 border-brand-600 flex items-center justify-center"
              >
                <span className="w-11 h-11 rounded-full bg-brand-600 block" />
              </button>
              <FileButton onFile={onFile} compact />
            </div>
          </>
        )}
      </div>
    );
  }

  // ===== ガイド線補正 =====
  if (step === "adj-front" || step === "adj-back") {
    const img = step === "adj-front" ? frontImg : backImg;
    return (
      <div className="space-y-4">
        <StepBadge step={step} />
        <p className="text-center text-sm text-gray-600">
          <span style={{ color: OUTER_COLOR }} className="font-bold">外周（青）</span>と
          <span style={{ color: INNER_COLOR }} className="font-bold">内枠（黄破線）</span>に合わせてください
        </p>

        <div ref={containerRef} className="relative w-full select-none rounded-xl overflow-hidden bg-gray-100" style={{ touchAction: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img && <img src={img} alt="撮影画像" className="block w-full" />}
          {renderRect("outer", outer, OUTER_COLOR, false, startDrag)}
          {renderRect("inner", inner, INNER_COLOR, true, startDrag)}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep(step === "adj-front" ? "cap-front" : "cap-back")}
            className="flex-1 border border-gray-300 rounded-lg py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            撮り直す
          </button>
          <button
            onClick={confirmAdjust}
            className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700"
          >
            確定して{step === "adj-front" ? "裏面へ" : "測定"}
          </button>
        </div>
      </div>
    );
  }

  // ===== 結果 =====
  const grade = front ? estimateGrade(front, back) : "—";
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}
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
      <div className="flex gap-3">
        <button onClick={restart} className="flex-1 border border-gray-300 rounded-lg py-3 text-sm text-gray-700 hover:bg-gray-50">
          もう一度
        </button>
        <button
          onClick={save}
          disabled={saving || !front}
          className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
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

function FileButton({ onFile, compact }: { onFile: (e: React.ChangeEvent<HTMLInputElement>) => void; compact?: boolean }) {
  return (
    <label className={compact ? "text-sm text-gray-500 cursor-pointer hover:text-gray-700" : "block text-center w-full border border-gray-300 rounded-lg py-3 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"}>
      {compact ? "画像選択" : "画像ファイルを選択"}
      <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
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

function renderRect(
  name: "outer" | "inner",
  r: NormRect,
  color: string,
  dashed: boolean,
  startDrag: (rect: "outer" | "inner", edge: keyof NormRect) => (e: React.PointerEvent) => void,
) {
  const box: React.CSSProperties = {
    position: "absolute",
    left: `${r.l * 100}%`,
    top: `${r.t * 100}%`,
    width: `${(r.r - r.l) * 100}%`,
    height: `${(r.b - r.t) * 100}%`,
    border: `2px ${dashed ? "dashed" : "solid"} ${color}`,
    pointerEvents: "none",
  };
  const cx = ((r.l + r.r) / 2) * 100;
  const cy = ((r.t + r.b) / 2) * 100;
  const handle = (leftPct: number, topPct: number, cursor: string): React.CSSProperties => ({
    position: "absolute",
    left: `${leftPct}%`,
    top: `${topPct}%`,
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: "50%",
    background: color,
    border: "2px solid #fff",
    touchAction: "none",
    cursor,
    zIndex: 5,
  });
  return (
    <div key={name}>
      <div style={box} />
      <div style={handle(r.l * 100, cy, "ew-resize")} onPointerDown={startDrag(name, "l")} />
      <div style={handle(r.r * 100, cy, "ew-resize")} onPointerDown={startDrag(name, "r")} />
      <div style={handle(cx, r.t * 100, "ns-resize")} onPointerDown={startDrag(name, "t")} />
      <div style={handle(cx, r.b * 100, "ns-resize")} onPointerDown={startDrag(name, "b")} />
    </div>
  );
}
