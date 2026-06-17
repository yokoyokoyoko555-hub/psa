"use client";

import type { InsuranceRule } from "@prisma/client";

export default function InsuranceRuleForm({ insuranceRules }: { insuranceRules: InsuranceRule[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">最低申告額</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">上限申告額</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">保険料（固定）</th>
          <th className="text-left px-3 py-2 text-gray-600 font-medium">保険料率（%）</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {insuranceRules.map((rule) => (
          <tr key={rule.id}>
            <td className="px-3 py-3">¥{rule.minValue.toLocaleString()}</td>
            <td className="px-3 py-3">{rule.maxValue ? `¥${rule.maxValue.toLocaleString()}` : "上限なし"}</td>
            <td className="px-3 py-3">¥{rule.fee.toLocaleString()}</td>
            <td className="px-3 py-3">{rule.feeRate ? `${rule.feeRate}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
