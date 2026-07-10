"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitPsaGroup } from "@/actions/admin";
import type { CustomServicePrice, ItemType, ServiceRegion } from "@prisma/client";

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

export default function SubmitGroupForm({
  groupId,
  customServicePrices,
}: {
  groupId: string;
  customServicePrices: CustomServicePrice[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [itemType, setItemType] = useState<ItemType>("TRADING_CARD");
  const [customServiceLevelId, setCustomServiceLevelId] = useState("");

  // PSA日本は常にトレーディングカードのみ。PSA USは3種別から選択。ADR-0023と同じ分岐。ADR-0051
  const itemTypeOptions: ItemType[] =
    region === "PSA_JP" ? ["TRADING_CARD"] : ["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE"];

  const tierOptions = customServicePrices
    .filter((p) => p.region === region && p.category === itemType && p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function handleRegionChange(r: ServiceRegion) {
    setRegion(r);
    setItemType("TRADING_CARD");
    setCustomServiceLevelId("");
  }

  function handleItemTypeChange(it: ItemType) {
    setItemType(it);
    setCustomServiceLevelId("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tier = tierOptions.find((t) => t.id === customServiceLevelId);
    if (!tier) return;
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    await submitPsaGroup(groupId, {
      region,
      itemType,
      customServiceLevelId: tier.id,
      customServiceLevelName: tier.name,
      psaSubmissionId: fd.get("psaSubmissionId") as string,
      submittedAt: new Date(fd.get("submittedAt") as string),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 flex-wrap items-end border-t border-gray-100 pt-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">提出先</label>
        <select
          value={region}
          onChange={(e) => handleRegionChange(e.target.value as ServiceRegion)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {(["PSA_JP", "PSA_US"] as ServiceRegion[]).map((r) => (
            <option key={r} value={r}>
              {REGION_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">アイテム種別</label>
        <select
          value={itemType}
          onChange={(e) => handleItemTypeChange(e.target.value as ItemType)}
          disabled={itemTypeOptions.length === 1}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-500"
        >
          {itemTypeOptions.map((it) => (
            <option key={it} value={it}>
              {ITEM_TYPE_LABELS[it]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">サービスレベル</label>
        <select
          value={customServiceLevelId}
          onChange={(e) => setCustomServiceLevelId(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="" disabled>
            選択してください
          </option>
          {tierOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">申込番号（Sub#）</label>
        <input
          type="text"
          name="psaSubmissionId"
          required
          placeholder="SUB-XXXXXXXX"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">提出日</label>
        <input
          type="date"
          name="submittedAt"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !customServiceLevelId}
        className="bg-purple-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "送信中..." : "PSAへ提出済として登録"}
      </button>
    </form>
  );
}
