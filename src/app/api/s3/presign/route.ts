import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCustomerSession } from "@/lib/customer-auth";
import { z } from "zod";

const schema = z.object({
  // cardId for post-creation uploads, tempId for pre-creation (apply form)
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
  const customer = await getCustomerSession();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { cardId, tempId, type, contentType } = parsed.data;
  const ext = contentType.split("/")[1];
  const prefix = cardId ? `cards/${cardId}` : `temp/${customer.id}/${tempId}`;
  const key = `${prefix}/${type}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET ?? "",
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return NextResponse.json({ uploadUrl, key });
}
