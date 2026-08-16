export const dynamic = "force-dynamic";

import { getPendingIdentityVerifications } from "@/actions/identity-verification";
import { generateDownloadUrl } from "@/lib/s3";
import { decrypt } from "@/lib/crypto";
import ReviewIdentityForm from "./ReviewIdentityForm";

/** 本人確認の審査待ち一覧（管理画面）。ADR-0087 */
export default async function AdminIdentityVerificationsPage() {
  const verifications = await getPendingIdentityVerifications();

  const withUrls = await Promise.all(
    verifications.map(async (v) => ({
      ...v,
      frontImageUrl: await generateDownloadUrl(v.frontImageKey),
      backImageUrl: v.backImageKey ? await generateDownloadUrl(v.backImageKey) : null,
    }))
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">本人確認 審査</h1>

      <div className="space-y-3">
        {withUrls.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            審査待ちの申請はありません。
          </div>
        )}
        {withUrls.map((v) => (
          <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="font-bold text-gray-900">{decrypt(v.customer.nameEncrypted)}</p>
            <p className="text-xs text-gray-500">
              {v.documentType} / 申請日時: {new Date(v.submittedAt).toLocaleString("ja-JP")}
            </p>
            <div className="mt-2 flex gap-2">
              <a href={v.frontImageUrl} target="_blank" rel="noreferrer">
                <img src={v.frontImageUrl} alt="表面" className="w-24 h-24 object-cover rounded border border-gray-200" />
              </a>
              {v.backImageUrl && (
                <a href={v.backImageUrl} target="_blank" rel="noreferrer">
                  <img src={v.backImageUrl} alt="裏面" className="w-24 h-24 object-cover rounded border border-gray-200" />
                </a>
              )}
            </div>
            <ReviewIdentityForm verificationId={v.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
