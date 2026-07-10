"use client";

import { useRouter } from "next/navigation";

/**
 * 決済完了後の共通確認画面（自己入力・代理入力の両方で使用）。
 * トレカ以外（未開封パック／コミック・マガジン）でも通用するよう「カード」という表記は使わない。ADR-0033
 */
export default function PaymentDoneScreen({
  applicationId,
  extraNote,
}: {
  applicationId: string | null;
  extraNote?: string;
}) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
      <div className="text-4xl">✅</div>
      <h2 className="text-lg font-bold text-gray-900">お支払いが完了しました</h2>
      <p className="text-sm text-gray-600">
        次に、提出方法（店頭持込・郵送）と日時をご予約ください。
        {extraNote ? ` ${extraNote}` : ""}
      </p>
      <div className="flex flex-col gap-3 pt-1">
        {applicationId && (
          <button
            onClick={() => router.push(`/mypage/submission-booking/${applicationId}/edit`)}
            className="bg-brand-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-brand-700 transition"
          >
            提出の予約へ進む
          </button>
        )}
        <button
          onClick={() => router.push("/mypage")}
          className={`font-bold px-6 py-3 rounded-lg transition ${
            applicationId
              ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-brand-600 text-white hover:bg-brand-700"
          }`}
        >
          マイページへ
        </button>
      </div>
    </div>
  );
}
