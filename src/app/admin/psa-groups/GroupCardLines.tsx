import CopyButton from "@/components/CopyButton";
import type { PsaGroupCardLine } from "@/actions/admin";

/**
 * PSA提出グループ内の全カードを、提出時に確定する連番で一覧表示する。
 * 同じ顧客の同名カードが複数枚あっても1行（枚数表記）、別の顧客なら別行になる。
 * 現物に貼るライン番号の元ネタとして使うため、コピーしやすいテキストも用意する。ADR-0075
 */
export default function GroupCardLines({ lines, finalized }: { lines: PsaGroupCardLine[]; finalized: boolean }) {
  if (lines.length === 0) return null;

  const text = lines
    .map((l) => `Line${l.lineNo}（${l.customerName}）${l.cardName} ${l.quantity}枚 [${l.applicationNo}]`)
    .join("\n");

  return (
    <div className="mb-4 border border-gray-100 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-600">
          行番号一覧（{finalized ? "提出時に確定済み" : "未提出のため仮の並びです"}）
        </p>
        <CopyButton text={text} />
      </div>
      <div className="space-y-1">
        {lines.map((l) => (
          <div key={l.cardId} className="text-xs text-gray-700 flex items-center gap-2">
            <span className="font-mono text-gray-400 shrink-0">Line{l.lineNo}</span>
            <span className="shrink-0">（{l.customerName}）</span>
            <span>
              {l.cardName} {l.quantity}枚
            </span>
            <span className="text-gray-400 font-mono ml-auto">{l.applicationNo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
