"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setItemTypeEnabled } from "@/actions/pricing";

type Region = "PSA_JP" | "PSA_US";
type ItemType = "TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE" | "AUTOGRAPH";

/** アイテム種別ごとの受付ON/OFFスイッチ。OFFにすると顧客の申込画面（自己入力・代理入力とも）で選べなくなる。 */
export default function ItemTypeEnabledForm({
  region,
  itemType,
  enabled,
}: {
  region: Region;
  itemType: ItemType;
  enabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleToggle() {
    setError("");
    startTransition(async () => {
      const result = await setItemTypeEnabled({ region, itemType, enabled: !enabled });
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "更新に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">このアイテム種別の受付を有効にする</p>
          <p className="text-xs text-gray-500 mt-1">
            OFFにすると、顧客の申込画面でこのアイテム種別を選べなくなります（料金設定・データは削除されません）。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={isPending}
          className={`shrink-0 relative w-12 h-7 rounded-full transition disabled:opacity-50 ${
            enabled ? "bg-brand-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
