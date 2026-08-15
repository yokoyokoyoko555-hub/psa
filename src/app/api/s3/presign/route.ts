import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCustomerSession } from "@/lib/customer-auth";
import { auth } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  // cardId for post-creation uploads, tempId for pre-creation (apply form / staff grading form)
  cardId: z.string().optional(),
  tempId: z.string().optional(),
  type: z.enum(["front", "back", "damage"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
}).refine((d) => d.cardId || d.tempId, { message: "cardId or tempId required" });

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

export async function POST(req: NextRequest) {
  // 顧客セッション優先。無ければ管理者/スタッフのNextAuthセッションを許可
  // （PSAグレード登録時のスラブ写真アップロード等、スタッフ操作向け。ADR-0077）
  const customer = await getCustomerSession();
  let staffId: string | null = null;
  if (!customer) {
    const session = await auth();
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (session?.user && role && ["ADMIN", "STAFF"].includes(role)) {
      staffId = (session.user as { id: string }).id;
    }
  }
  if (!customer && !staffId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { cardId, tempId, type, contentType } = parsed.data;
  const ext = contentType.split("/")[1];
  const prefix = cardId
    ? `cards/${cardId}`
    : staffId
    ? `staff-temp/${staffId}/${tempId}`
    : `temp/${customer!.id}/${tempId}`;
  const key = `${prefix}/${type}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET ?? "",
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return NextResponse.json({ uploadUrl, key });
}
