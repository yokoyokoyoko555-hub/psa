import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["ADMIN"].includes((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: {
    id: string;
    pricePerCard: number;
    maxDeclaredValue: number | null;
    isActive: boolean;
  }[] = await req.json();

  for (const u of updates) {
    await prisma.servicePrice.update({
      where: { id: u.id },
      data: {
        pricePerCard: u.pricePerCard,
        maxDeclaredValue: u.maxDeclaredValue,
        isActive: u.isActive,
      },
    });
  }

  return NextResponse.json({ success: true });
}
