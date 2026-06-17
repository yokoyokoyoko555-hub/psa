"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPsaSubmissionGroup } from "@/actions/admin";

export default function CreateGroupForm({ cardIds }: { cardIds: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    await createPsaSubmissionGroup(cardIds);
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="bg-yellow-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition text-sm"
    >
      {loading ? "作成中..." : `${cardIds.length}枚で提出グループを作成`}
    </button>
  );
}
