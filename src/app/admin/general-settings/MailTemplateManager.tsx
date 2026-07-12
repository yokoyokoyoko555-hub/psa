"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MailTemplate } from "@prisma/client";
import { saveMailTemplate } from "@/actions/mail-template";

export default function MailTemplateManager({ templates }: { templates: MailTemplate[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState(() =>
    Object.fromEntries(
      templates.map((t) => [t.id, { subject: t.subject, bodyHtml: t.bodyHtml, enabled: t.enabled }]),
    ),
  );
  const [savedId, setSavedId] = useState<string | null>(null);

  function update(id: string, patch: Partial<{ subject: string; bodyHtml: string; enabled: boolean }>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function save(id: string) {
    setSavedId(null);
    startTransition(async () => {
      const s = state[id];
      const res = await saveMailTemplate({ id, subject: s.subject, bodyHtml: s.bodyHtml, enabled: s.enabled });
      if (res.success) {
        setSavedId(id);
        router.refresh();
      } else {
        alert(res.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        本文・件名に <code>{"{{var}}"}</code> 形式の差込変数を使えます（例: <code>{"{{name}}"}</code>, <code>{"{{applicationNo}}"}</code>, <code>{"{{amount}}"}</code>）。
        SMTP未設定または「有効」OFFの場合は送信されません。
      </p>
      {templates.map((t) => {
        const s = state[t.id];
        return (
          <details key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <summary className="font-bold text-gray-900 cursor-pointer select-none">
              {t.name} <span className="text-xs text-gray-400">（{t.key}{t.enabled ? "" : " / 無効"}）</span>
            </summary>
            <div className="mt-3 space-y-3">
              <label className="block text-sm space-y-1">
                <span className="text-gray-700">件名</span>
                <input value={s.subject} onChange={(e) => update(t.id, { subject: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900" />
              </label>
              <label className="block text-sm space-y-1">
                <span className="text-gray-700">本文（HTML可）</span>
                <textarea value={s.bodyHtml} onChange={(e) => update(t.id, { bodyHtml: e.target.value })} rows={8} className="w-full border border-gray-300 rounded px-2 py-2 text-sm text-gray-900 font-mono" />
              </label>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => update(t.id, { enabled: e.target.checked })} />
                  有効（送信する）
                </label>
                <div className="flex items-center gap-3">
                  {savedId === t.id && <span className="text-green-700 text-sm">保存しました</span>}
                  <button onClick={() => save(t.id)} disabled={isPending} className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm">
                    {isPending ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
