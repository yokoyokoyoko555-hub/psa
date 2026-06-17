import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(options: MailOptions) {
  return transporter.sendMail({
    from: `トレカビンクス <${process.env.EMAIL_FROM ?? process.env.SMTP_FROM}>`,
    ...options,
  });
}

export function upchargeNotificationHtml(params: {
  customerName: string;
  cardName: string;
  reason: string;
  amount: number;
  appUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Upcharge（追加請求）のお知らせ</h2>
      <p>${params.customerName} 様</p>
      <p>PSA鑑定の結果、以下のカードにUpchargeが発生しました。</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;">カード名</td><td style="padding: 8px; border: 1px solid #ddd;">${params.cardName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;">理由</td><td style="padding: 8px; border: 1px solid #ddd;">${params.reason}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;">追加金額</td><td style="padding: 8px; border: 1px solid #ddd;">¥${params.amount.toLocaleString()}</td></tr>
      </table>
      <p>登録済みのカードより自動的に請求いたします。</p>
      <p><a href="${params.appUrl}/mypage">マイページで確認する</a></p>
    </div>
  `;
}
