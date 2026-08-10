import { createPaidInvoice } from "./stripe";
import { sendMail, paymentReceiptHtml } from "./mailer";
import { decrypt } from "./crypto";

/**
 * 決済完了後、適格請求書PDF・領収書PDFを生成しメールで送付する（best-effort、失敗しても呼び出し元は止めない）。
 * 自己入力初回決済・代理入力先払い・差額請求・Upchargeの全決済確定箇所から共通で呼び出す。
 */
export async function sendPaymentReceiptEmail(params: {
  applicationId: string;
  applicationNo: string;
  /** 請求書の説明文（例: "PSA申込 APP-xxx" "Upcharge: カード名"） */
  description: string;
  /** 明細の合計と一致すべき実際の請求額。ズレがあれば調整行を自動で足す。 */
  totalAmount: number;
  /** 明細行。金額は税込。 */
  lineItems: { description: string; amount: number }[];
  customer: { stripeCustomerId: string | null; email: string; nameEncrypted: string };
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[receipt] skip ${params.applicationNo}: RESEND_API_KEY not set`);
    return;
  }
  if (!params.customer.stripeCustomerId) {
    console.log(`[receipt] skip ${params.applicationNo}: customer has no stripeCustomerId`);
    return;
  }
  console.log(`[receipt] start ${params.applicationNo}`);
  try {
    const items = [...params.lineItems];
    // 内訳の合計が実際の請求額とズレないよう、差分があれば調整行を足して必ず一致させる
    const sum = items.reduce((s, i) => s + i.amount, 0);
    const diff = Math.round(params.totalAmount - sum);
    if (diff !== 0) items.push({ description: "調整額", amount: diff });

    const { invoicePdf, receiptPdf } = await createPaidInvoice({
      customerId: params.customer.stripeCustomerId,
      applicationId: params.applicationId,
      description: params.description,
      lineItems: items,
    });

    console.log(
      `[receipt] invoice created ${params.applicationNo}: invoicePdf=${!!invoicePdf} receiptPdf=${!!receiptPdf}`
    );
    if (!invoicePdf && !receiptPdf) {
      console.log(`[receipt] skip ${params.applicationNo}: no PDF was generated`);
      return;
    }

    const attachments: { filename: string; content: string }[] = [];
    if (invoicePdf) {
      attachments.push({ filename: `invoice-${params.applicationNo}.pdf`, content: invoicePdf.toString("base64") });
    }
    if (receiptPdf) {
      attachments.push({ filename: `receipt-${params.applicationNo}.pdf`, content: receiptPdf.toString("base64") });
    }

    await sendMail({
      to: params.customer.email,
      subject: `【トレカビンクス】ご請求書・領収書（${params.applicationNo}）`,
      html: paymentReceiptHtml({
        customerName: decrypt(params.customer.nameEncrypted),
        applicationNo: params.applicationNo,
        appUrl: process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "",
      }),
      attachments,
    });
    console.log(`[receipt] sent ${params.applicationNo}`);
  } catch (err) {
    console.error(`[receipt] failed ${params.applicationNo}:`, err);
  }
}
