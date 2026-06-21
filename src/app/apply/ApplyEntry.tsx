"use client";

import { useState } from "react";
import Link from "next/link";
import ApplyForm, { type InitialDraft } from "./ApplyForm";
import StoreRequestForm from "./StoreRequestForm";
import type { ServicePrice, ShippingRule, InsuranceRule } from "@prisma/client";
import type { CustomerProfile } from "@/actions/customer";
import type { Address } from "@/actions/address";

type Props = {
  customerId: string;
  stripePublishableKey: string;
  servicePrices: ServicePrice[];
  shippingRules: ShippingRule[];
  insuranceRules: InsuranceRule[];
  profile: CustomerProfile | null;
  addresses: Address[];
  initialDraft?: InitialDraft | null;
};

export default function ApplyEntry(props: Props) {
  const [mode, setMode] = useState<"choose" | "self" | "store">(
    props.initialDraft ? "self" : "choose"
  );

  const header = (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center gap-4">
        <Link href="/mypage" className="shrink-0 hover:opacity-70 transition">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
        </Link>
        <h1 className="font-bold text-gray-900">PSA鑑定申込</h1>
        <div className="flex-1" />
        <Link
          href="/mypage/settings"
          aria-label="アカウント設定"
          title="アカウント設定"
          className="w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg hover:border-brand-500 hover:bg-brand-50 transition"
        >
          <svg className="h-5 w-5 text-brand-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3.31-3.58-6-8-6Z" />
          </svg>
        </Link>
      </div>
    </header>
  );

  if (mode === "self") {
    return <ApplyForm {...props} />;
  }
  if (mode === "store") {
    return (
      <div className="min-h-screen bg-gray-50">
        {header}
        <main className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={() => setMode("choose")}
            className="text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            ← 入力方法の選択へ戻る
          </button>
          <StoreRequestForm
            profile={props.profile}
            addresses={props.addresses}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {header}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-sm text-gray-600 mb-8 text-center">入力方法を選択してください</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setMode("self")}
            className="border-2 border-gray-200 bg-white hover:border-brand-400 rounded-2xl p-6 text-left transition"
          >
            <div className="text-3xl mb-3">📝</div>
            <p className="font-bold text-gray-900 text-lg">自分で入力する</p>
            <p className="text-sm text-gray-500 mt-1">
              カード情報を入力して、その場で申込・決済します。代行手数料なし。
            </p>
          </button>
          <button
            onClick={() => setMode("store")}
            className="border-2 border-gray-200 bg-white hover:border-brand-400 rounded-2xl p-6 text-left transition"
          >
            <div className="text-3xl mb-3">🏪</div>
            <p className="font-bold text-gray-900 text-lg">店舗に代理入力を依頼</p>
            <p className="text-sm text-gray-500 mt-1">
              カードをお預けいただき、当社がカード明細を入力します（代行手数料あり）。
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
