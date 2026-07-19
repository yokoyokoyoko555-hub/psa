// 自己入力(ApplyForm)・代理入力(StoreRequestForm)で共通して使う、制定済み利用規約(LegalDocument"terms")の型。ADR-0077
export type TermsDocument = {
  title: string;
  body: string;
  establishedAt: Date;
  revisedAt: Date[];
};
