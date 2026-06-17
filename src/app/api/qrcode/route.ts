import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cardId = req.nextUrl.searchParams.get("cardId");
  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, cardNo: true },
  });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const url = `${process.env.APP_URL}/admin/cards/${card.id}`;
  const qr = await QRCode.toBuffer(url, { type: "png", width: 300 });

  return new NextResponse(qr as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-${card.cardNo}.png"`,
    },
  });
}
