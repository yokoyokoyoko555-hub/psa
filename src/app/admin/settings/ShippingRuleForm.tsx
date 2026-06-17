"use client";

import type { ShippingRule } from "@prisma/client";

const RETURN_METHOD_LABELS: Record<string, string> = {
  STORE_PICKUP: "店頭受取",
  SHIPPING: "配送",
};

export default function ShippingRuleForm({ shippingRules }: { shippingRules: ShippingRule[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">返却方法</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">名称</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">最低金額</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">上限金額</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">送料</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {shippingRules.map((rule) => (
          <tr key={rule.id}>
            <td className="px-3 py-3">{RETURN_METHOD_LABELS[rule.returnMethod]}</td>
            <td className="px-3 py-3 font-medium">{rule.name}</td>
            <td className="px-3 py-3">¥{rule.minAmount.toLocaleString()}</td>
            <td className="px-3 py-3">{rule.maxAmount ? `¥${rule.maxAmount.toLocaleString()}` : "上限なし"}</td>
            <td className="px-3 py-3 font-bold">¥{rule.fee.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
