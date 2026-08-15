"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerCardGrade } from "@/actions/card-grading";

type Unit = {
  psaCertNo: string;
  psaGrade: string;
  frontImageKey?: string;
  backImageKey?: string;
  frontUploading?: boolean;
  backUploading?: boolean;
};

/** PSAグレード登録＋個体分割フォーム（申込詳細のカード行から開く）。ADR-0077 */
export default function CardGradingForm({
  cardId,
  cardNo,
  defaultQuantity,
  onDone,
}: {
  cardId: string;
  cardNo: string;
  defaultQuantity: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>(
    Array.from({ length: Math.max(1, defaultQuantity) }, () => ({ psaCertNo: "", psaGrade: "" }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function addUnit() {
    setUnits((prev) => [...prev, { psaCertNo: "", psaGrade: "" }]);
  }
  function removeUnit(index: number) {
    setUnits((prev) => prev.filter((_, i) => i !== index));
  }
  function updateUnit(index: number, patch: Partial<Unit>) {
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  }

  async function handleUpload(index: number, side: "front" | "back", file: File) {
    updateUnit(index, side === "front" ? { frontUploading: true } : { backUploading: true });
    setError("");
    try {
      const tempId = `${cardId}-${index}-${side}-${Date.now()}`;
      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempId, type: side, contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error("presign failed");
      const { uploadUrl, key } = (await presignRes.json()) as { uploadUrl: string; key: string };
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("upload failed");
      updateUnit(
        index,
        side === "front"
          ? { frontImageKey: key, frontUploading: false }
          : { backImageKey: key, backUploading: false }
      );
    } catch {
      setError("画像アップロードに失敗しました");
      updateUnit(index, side === "front" ? { frontUploading: false } : { backUploading: false });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const result = await registerCardGrade({
        cardId,
        units: units.map((u) => ({
          psaCertNo: u.psaCertNo,
          psaGrade: u.psaGrade,
          frontImageKey: u.frontImageKey,
          backImageKey: u.backImageKey,
        })),
      });
      if (!result.success) {
        setError(result.error ?? "登録に失敗しました");
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError("登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = units.length > 0 && units.every((u) => u.psaCertNo.trim() && u.psaGrade.trim());

  return (
    <div className="mt-2 space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">
        {cardNo} の個体登録（PSAから実際に返却された枚数分を入力してください。申告枚数と異なっていても構いません）
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="space-y-3">
        {units.map((unit, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600">個体 {i + 1}</span>
              {units.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeUnit(i)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  削除
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">PSA証明書番号</label>
                <input
                  value={unit.psaCertNo}
                  onChange={(e) => updateUnit(i, { psaCertNo: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">グレード</label>
                <input
                  value={unit.psaGrade}
                  onChange={(e) => updateUnit(i, { psaGrade: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">表面画像</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => e.target.files?.[0] && handleUpload(i, "front", e.target.files[0])}
                  className="w-full text-xs"
                />
                {unit.frontUploading && <span className="text-xs text-gray-400">アップロード中...</span>}
                {unit.frontImageKey && <span className="text-xs text-green-600">アップロード済み</span>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">裏面画像</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => e.target.files?.[0] && handleUpload(i, "back", e.target.files[0])}
                  className="w-full text-xs"
                />
                {unit.backUploading && <span className="text-xs text-gray-400">アップロード中...</span>}
                {unit.backImageKey && <span className="text-xs text-green-600">アップロード済み</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addUnit} className="text-xs text-brand-600 hover:underline">
        + 個体を追加
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
          className="bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {submitting ? "登録中..." : `${units.length}件を登録`}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
