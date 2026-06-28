"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 失敗時は何もしない
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="コピー"
      className="text-xs text-gray-400 hover:text-brand-600 border border-gray-200 rounded px-1.5 py-0.5"
    >
      {copied ? "コピー済" : label}
    </button>
  );
}
