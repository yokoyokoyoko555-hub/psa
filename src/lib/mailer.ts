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

/**
 * DBのメールテンプレート(MailTemplate)を使って送信。{{var}} を vars で置換。
 * SMTP未設定・テンプレ無効/不在・送信失敗時は何もしない（呼び出し側の処理を止めない）。ADR-0018
 */
export async function sendTemplate(
  key: string,
  to: string,
  vars: Record<string, string | number> = {},
): Promise<boolean> {
  if (!process.env.SMTP_HOST) return false;
  try {
    const { prisma } = await import("./prisma");
    const tpl = await prisma.mailTemplate.findUnique({ where: { key } });
    if (!tpl || !tpl.enabled) return false;
    const fill = (s: string) =>
      s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ""));
    await sendMail({ to, subject: fill(tpl.subject), html: fill(tpl.bodyHtml) });
    return true;
  } catch {
    return false;
  }
}

export function registrationVerificationHtml(params: { verifyUrl: string }): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>新規会員登録のご案内</h2>
      <p>トレカビンクス PSA鑑定受付代行サービスへのご登録ありがとうございます。</p>
      <p>下記のボタンから24時間以内に会員情報のご登録をお願いします。</p>
      <p style="text-align:center; margin: 24px 0;">
        <a href="${params.verifyUrl}" style="background:#6b0505;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">会員登録に進む</a>
      </p>
      <p style="font-size:12px;color:#888;">このリンクは24時間有効です。心当たりがない場合はこのメールを破棄してください。</p>
      <p style="font-size:12px;color:#888;">${params.verifyUrl}</p>
    </div>
  `;
}

export function passwordResetHtml(params: { resetUrl: string }): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>パスワード再設定のご案内</h2>
      <p>パスワード再設定のリクエストを受け付けました。</p>
      <p>下記のボタンから1時間以内に新しいパスワードをご設定ください。</p>
      <p style="text-align:center; margin: 24px 0;">
        <a href="${params.resetUrl}" style="background:#6b0505;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">パスワードを再設定する</a>
      </p>
      <p style="font-size:12px;color:#888;">このリンクは1時間有効です。心当たりがない場合はこのメールを破棄してください。パスワードは変更されません。</p>
      <p style="font-size:12px;color:#888;">${params.resetUrl}</p>
    </div>
  `;
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
