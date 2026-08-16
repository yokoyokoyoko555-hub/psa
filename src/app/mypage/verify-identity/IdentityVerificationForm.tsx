"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitIdentityVerification } from "@/actions/identity-verification";

const DOCUMENT_TYPES = ["運転免許証", "マイナンバーカード", "パスポート", "健康保険証"];

/** 本人確認の申請フォーム（身分証画像アップロード）。ADR-0087 */
export default function IdentityVerificationForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [frontImageKey, setFrontImageKey] = useState("");
  const [backImageKey, setBackImageKey] = useState("");
  const [frontUploading, setFrontUploading] = useState(false);
  const [backUploading, setBackUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function upload(side: "front" | "back", file: File) {
    const setUploading = side === "front" ? setFrontUploading : setBackUploading;
    const setKey = side === "front" ? setFrontImageKey : setBackImageKey;
    setUploading(true);
    setError("");
    try {
      const tempId = `identity-${side}-${Date.now()}`;
      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempId, type: side, contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error("presign failed");
      const { uploadUrl, key } = (await presignRes.json()) as { uploadUrl: string; key: string };
      const uploadRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!uploadRes.ok) throw new Error("upload failed");
      setKey(key);
    } catch {
      setError("画像アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await submitIdentityVerification({
        documentType,
        frontImageKey,
        backImageKey: backImageKey || undefined,
      });
      if (res.success) {
        setSubmitted(true);
        router.refresh();
      } else {
        setError(res.error ?? "申請に失敗しました");
      }
    });
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-700">本人確認の申請を受け付けました。審査完了までお待ちください。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <p className="text-xs text-gray-500">
        eBay買取のお申し込みには本人確認が必要です。運転免許証等の身分証を撮影してアップロードしてください。
      </p>
      <div>
        <label className="block text-sm text-gray-700 mb-1">書類の種類</label>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">表面</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => e.target.files?.[0] && upload("front", e.target.files[0])}
            className="w-full text-xs"
          />
          {frontUploading && <span className="text-xs text-gray-400">アップロード中...</span>}
          {frontImageKey && <span className="text-xs text-green-600">アップロード済み</span>}
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">裏面（任意）</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => e.target.files?.[0] && upload("back", e.target.files[0])}
            className="w-full text-xs"
          />
          {backUploading && <span className="text-xs text-gray-400">アップロード中...</span>}
          {backImageKey && <span className="text-xs text-green-600">アップロード済み</span>}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending || !frontImageKey}
        className="w-full bg-brand-600 text-white font-bold py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "送信中..." : "この内容で申請する"}
      </button>
    </div>
  );
}
