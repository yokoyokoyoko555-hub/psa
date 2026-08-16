"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewIdentityVerification } from "@/actions/identity-verification";

/** ADMIN/STAFFによる本人確認の審査（承認/却下）。ADR-0087 */
export default function ReviewIdentityForm({ verificationId }: { verificationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState("");

  function approve() {
    setError("");
    startTransition(async () => {
      const res = await reviewIdentityVerification({ verificationId, approve: true });
      if (res.success) router.refresh();
      else setError(res.error ?? "処理に失敗しました");
    });
  }

  function reject() {
    setError("");
    startTransition(async () => {
      const res = await reviewIdentityVerification({ verificationId, approve: false, rejectionReason });
      if (res.success) router.refresh();
      else setError(res.error ?? "処理に失敗しました");
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {showReject ? (
        <div className="space-y-2">
          <input
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="却下理由"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={reject} disabled={isPending} className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50">
              却下を確定
            </button>
            <button onClick={() => setShowReject(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={approve} disabled={isPending} className="bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded hover:bg-brand-700 disabled:opacity-50">
            {isPending ? "処理中..." : "承認"}
          </button>
          <button onClick={() => setShowReject(true)} disabled={isPending} className="border border-gray-300 text-gray-700 text-xs font-bold px-4 py-1.5 rounded hover:bg-gray-50">
            却下
          </button>
        </div>
      )}
    </div>
  );
}
