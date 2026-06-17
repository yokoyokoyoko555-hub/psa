import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

let _s3: S3Client | null = null;

export function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3;
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set");
  return bucket;
}

export async function generateUploadUrl(params: {
  cardId: string;
  type: "front" | "back" | "damage";
  contentType: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const ext = params.contentType.split("/")[1] ?? "jpg";
  const key = `cards/${params.cardId}/${params.type}/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn: 300 });
  return { uploadUrl, key };
}

export async function generateDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(getS3(), command, { expiresIn: 3600 });
}

export async function deleteObject(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}
