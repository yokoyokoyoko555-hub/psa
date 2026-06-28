"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

const schema = z.object({
  id: z.string(),
  subject: z.string().min(1).max(200),
  bodyHtml: z.string().min(1),
  enabled: z.boolean(),
});

export async function saveMailTemplate(
  input: z.infer<typeof schema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  await prisma.mailTemplate.update({
    where: { id: parsed.data.id },
    data: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, enabled: parsed.data.enabled },
  });
  revalidatePath("/admin/mail-templates");
  return { success: true };
}
