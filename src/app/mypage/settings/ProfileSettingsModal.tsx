"use client";

import { useState } from "react";
import type { CustomerProfile } from "@/actions/customer";
import ProfileEditForm from "../profile/ProfileEditForm";

export default function ProfileSettingsModal({ profile }: { profile: CustomerProfile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section id="profile" className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">登録情報の編集</h2>
            <p className="text-sm text-gray-500 mt-1">氏名、住所、電話番号を管理します。</p>
            <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
              <p>
                <span className="text-gray-400">氏名:</span> {profile.lastName} {profile.firstName}
              </p>
              <p>
                <span className="text-gray-400">電話:</span> {profile.phone}
              </p>
              <p className="sm:col-span-2">
                <span className="text-gray-400">住所:</span> 〒{profile.postalCode} {profile.prefecture}
                {profile.address}
                {profile.address2 ?? ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
          >
            編集
          </button>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8">
          <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-5 rounded-t-xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900">登録情報の編集</h2>
                <p className="text-sm text-gray-500 mt-1">氏名、住所、電話番号を管理します。</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-gray-200 px-3 py-1 text-sm font-bold text-gray-500 hover:bg-gray-50"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <ProfileEditForm profile={profile} framed={false} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
