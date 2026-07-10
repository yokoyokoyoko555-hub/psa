import type { ReactNode } from "react";

/**
 * 規程文書（利用規約・個人情報保護方針・カスタマーハラスメントポリシー等）の簡易Markdownを
 * JSXへ変換する。管理画面のテキストエリアで自由編集された本文を描画するための最小限のパーサー
 * （この用途に必要な記法のみサポートし、外部ライブラリは追加しない）。
 *
 * 対応記法:
 *   # 見出し1 / ## 見出し2 / ### 見出し3
 *   * 箇条書き（-でも可）
 *   **太字**
 *   空行区切りの段落
 *   --- （区切り線。見出しの下線で十分なため非表示にする）
 */
export function renderLegalMarkdown(body: string): ReactNode[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap">
        {renderInline(paragraphLines.join("\n"))}
      </p>
    );
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key++} className="list-disc pl-5 space-y-0.5">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "" || trimmed === "---") {
      flushParagraph();
      flushList();
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const bullet = line.match(/^[*-]\s+(.*)$/);

    if (h2) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={key++} className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2 pt-4">
          {renderInline(h2[1])}
        </h2>
      );
    } else if (h3) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={key++} className="font-bold text-gray-900 pt-2">
          {renderInline(h3[1])}
        </h3>
      );
    } else if (h1) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1 key={key++} className="text-xl font-bold text-gray-900 pt-2">
          {renderInline(h1[1])}
        </h1>
      );
    } else if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();

  return blocks;
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i}>{m[1]}</strong> : part;
  });
}
