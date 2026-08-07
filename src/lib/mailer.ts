// SMTP（生TCP接続）はRailway環境でポートがブロックされ接続がタイムアウトしたため、
// Resendのメール送信をHTTP API（HTTPS）経由に切り替えた。HTTPSはブロックされにくく安定する。
const RESEND_API_URL = "https://api.resend.com/emails";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  /** PDF等の添付ファイル（Resend APIはBase64エンコードされたcontentを要求する）。 */
  attachments?: { filename: string; content: string }[];
}

export async function sendMail(options: MailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `トレカビンクス <${process.env.EMAIL_FROM ?? process.env.SMTP_FROM}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.attachments ? { attachments: options.attachments } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * DBのメールテンプレート(MailTemplate)を使って送信。{{var}} を vars で置換。
 * メール未設定・テンプレ無効/不在・送信失敗時は何もしない（呼び出し側の処理を止めない）。ADR-0018
 */
export async function sendTemplate(
  key: string,
  to: string,
  vars: Record<string, string | number> = {},
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const { prisma } = await import("./prisma");
    const tpl = await prisma.mailTemplate.findUnique({ where: { key } });
    if (!tpl || !tpl.enabled) return false;
    const fill = (s: string) =>
      s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ""));
    await sendMail({ to, subject: fill(tpl.subject), html: fill(tpl.bodyHtml) });
    return true;
  } catch (err) {
    console.error(`Failed to send mail template "${key}":`, err);
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

export function registrationCompleteHtml(params: { customerName: string; memberNo: string; appUrl: string }): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>会員登録が完了しました</h2>
      <p>${escapeHtml(params.customerName)} 様</p>
      <p>トレカビンクス PSA鑑定受付代行サービスへの会員登録が完了しました。</p>
      <p style="color:#888;font-size:12px;">会員番号: ${escapeHtml(params.memberNo)}</p>
      <p>さっそくPSA鑑定のお申込みができます。</p>
      <p style="text-align:center; margin: 24px 0;">
        <a href="${params.appUrl}/mypage" style="background:#6b0505;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">マイページへ</a>
      </p>
    </div>
  `;
}

export function paymentReceiptHtml(params: { customerName: string; applicationNo: string; appUrl: string }): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>ご請求書・領収書</h2>
      <p>${escapeHtml(params.customerName)} 様</p>
      <p>お支払いいただいたお申込みのご請求書（適格請求書）と領収書をPDFで添付いたします。</p>
      <p style="color:#888;font-size:12px;">申込番号: ${escapeHtml(params.applicationNo)}</p>
      <p><a href="${params.appUrl}/mypage">マイページで確認する</a></p>
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

// 件名・回答内容は顧客/管理者の自由入力のため、メールHTMLへの埋め込み前にエスケープする。
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inquiryReceivedHtml(params: {
  customerName: string;
  subject: string;
  body: string;
  appUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>お問い合わせを受け付けました</h2>
      <p>${escapeHtml(params.customerName)} 様</p>
      <p>以下の内容でお問い合わせを受け付けました。担当者より順次ご返信いたしますので、今しばらくお待ちください。</p>
      <p style="color:#888;font-size:12px;">件名: ${escapeHtml(params.subject)}</p>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px;white-space:pre-wrap;">${escapeHtml(params.body)}</div>
      <p style="margin-top:16px;"><a href="${params.appUrl}/mypage">マイページで確認する</a></p>
    </div>
  `;
}

/** スタッフ宛の内部通知（新規問い合わせ・顧客からの返信）。顧客向けテンプレートと違いエスケープ不要（管理画面のみで表示）。 */
export function staffInquiryNotificationHtml(params: {
  customerName: string;
  subject: string;
  body: string;
  isFollowUp: boolean;
  appUrl: string;
  inquiryId: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${params.isFollowUp ? "顧客からの返信があります" : "新しいお問い合わせがあります"}</h2>
      <p style="color:#888;font-size:12px;">顧客: ${escapeHtml(params.customerName)} ／ 件名: ${escapeHtml(params.subject)}</p>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px;white-space:pre-wrap;">${escapeHtml(params.body)}</div>
      <p style="margin-top:16px;"><a href="${params.appUrl}/admin/inquiries/${params.inquiryId}">管理画面で確認する</a></p>
    </div>
  `;
}

export function inquiryReplyHtml(params: {
  customerName: string;
  subject: string;
  replyText: string;
  appUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>お問い合わせへの回答</h2>
      <p>${escapeHtml(params.customerName)} 様</p>
      <p>お問い合わせいただいた下記の件について、回答いたします。</p>
      <p style="color:#888;font-size:12px;">件名: ${escapeHtml(params.subject)}</p>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px;white-space:pre-wrap;">${escapeHtml(params.replyText)}</div>
      <p style="margin-top:16px;"><a href="${params.appUrl}/mypage">マイページで確認する</a></p>
    </div>
  `;
}

export function returnReadyHtml(params: {
  customerName: string;
  applicationNo: string;
  isStorePickup: boolean;
  appUrl: string;
}): string {
  const actionLabel = params.isStorePickup ? "店頭でお受け取りいただけます" : "返送準備を進めます";
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>PSA鑑定が完了しました</h2>
      <p>${escapeHtml(params.customerName)} 様</p>
      <p>ご提出いただいたカードのPSA鑑定が完了し、${actionLabel}。</p>
      <p style="color:#888;font-size:12px;">申込番号: ${escapeHtml(params.applicationNo)}</p>
      <p><a href="${params.appUrl}/mypage">マイページで確認する</a></p>
    </div>
  `;
}

export function returnedHtml(params: {
  customerName: string;
  applicationNo: string;
  isStorePickup: boolean;
  appUrl: string;
}): string {
  const title = params.isStorePickup ? "店頭でのお受け取りが完了しました" : "返送が完了しました";
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${title}</h2>
      <p>${escapeHtml(params.customerName)} 様</p>
      <p>ご提出いただいたカードの${params.isStorePickup ? "お受け取り" : "返送"}が完了しました。ありがとうございました。</p>
      <p style="color:#888;font-size:12px;">申込番号: ${escapeHtml(params.applicationNo)}</p>
      <p><a href="${params.appUrl}/mypage">マイページで確認する</a></p>
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
