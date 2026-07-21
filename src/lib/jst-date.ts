// サーバーのタイムゾーン（Railway等はUTCが既定でJSTではない）に依存させず、常にJST基準で日時を
// 表示するための共通ヘルパー。date-fnsのformat()等、Dateのローカルgetterを使うAPIは、渡したDateを
// サーバーのローカルタイムゾーンで解釈してしまう。JST分だけ加算したDateを渡すことで、
// サーバーがどのタイムゾーンで動いていても常にJSTとして表示されるようにする。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** date-fnsのformat()等に渡す前に使う。DateのローカルgetterがJSTの値を返すようシフトする。 */
export function toJstDisplay(date: Date): Date {
  return new Date(date.getTime() + JST_OFFSET_MS);
}
