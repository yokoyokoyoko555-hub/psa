// サーバー起動時に1回だけ呼ばれる（Next.js標準のinstrumentation hook）。
// Prisma（Node専用）に依存する処理はedge runtime向けにバンドルされるとビルドエラーになるため、
// require()でnodejs runtime時のみ読み込む（Next公式ドキュメントの分岐パターン）。
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Next公式ドキュメントの推奨パターン（動的importだとedge向けバンドルにもPrisma依存が混入しビルドエラーになる）
    require("./instrumentation-node");
  }
}
