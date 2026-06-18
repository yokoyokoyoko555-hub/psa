"use client";

import { useState } from "react";
import ApplyForm from "./ApplyForm";
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
};

export default function ApplyEntry(props: Props) {
  const [mode, setMode] = useState<"choose" | "self" | "store">("choose");

  if (mode === "self") {
    return <ApplyForm {...props} />;
  }
  if (mode === "store") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => setMode("choose")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          ← 入力方法の選択へ戻る
        </button>
        <StoreRequestForm />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">PSA鑑定申込</h1>
      <p className="text-sm text-gray-600 mb-8 text-center">入力方法を選択してください</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setMode("self")}
          className="border-2 border-gray-200 hover:border-brand-400 rounded-2xl p-6 text-left transition"
        >
          <div className="text-3xl mb-3">📝</div>
          <p className="font-bold text-gray-900 text-lg">自分で入力する</p>
          <p className="text-sm text-gray-500 mt-1">
            カード情報を入力して、その場で申込・決済します。代行手数料なし。
          </p>
        </button>
        <button
          onClick={() => setMode("store")}
          className="border-2 border-gray-200 hover:border-brand-400 rounded-2xl p-6 text-left transition"
        >
          <div className="text-3xl mb-3">🏪</div>
          <p className="font-bold text-gray-900 text-lg">店舗に代理入力を依頼</p>
          <p className="text-sm text-gray-500 mt-1">
            カードをお預けいただき、当社がカード明細を入力します（代行手数料あり）。
          </p>
        </button>
      </div>
    </div>
  );
}
