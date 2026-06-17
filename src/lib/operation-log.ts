import { prisma } from "./prisma";

interface LogParams {
  userId?: string;
  customerId?: string;
  ipAddress: string;
  userAgent?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function logOperation(params: LogParams) {
  await prisma.operationLog.create({
    data: {
      userId: params.userId,
      customerId: params.customerId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      before: params.before as object ?? undefined,
      after: params.after as object ?? undefined,
    },
  });
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
