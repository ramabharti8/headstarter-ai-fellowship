"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrg, assertRole } from "@/lib/tenant";
import { orgSettingsSchema, inviteSchema, apiKeySchema } from "@/lib/validation";
import { generateApiKey } from "@/lib/api-key";
import { logger } from "@/lib/logger";

type Result = { error?: string; ok?: boolean; secret?: string };

export async function updateOrgSettings(_prev: Result, formData: FormData): Promise<Result> {
  const { org } = await requireOrg();
  assertRole(org.role, Role.ADMIN);
  const parsed = orgSettingsSchema.safeParse({
    name: formData.get("name"),
    systemPrompt: formData.get("systemPrompt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await prisma.organization.update({ where: { id: org.id }, data: parsed.data });
  revalidatePath("/settings");
  return { ok: true };
}

export async function inviteMember(_prev: Result, formData: FormData): Promise<Result> {
  const { user, org } = await requireOrg();
  assertRole(org.role, Role.ADMIN);
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Enter a valid email and role" };

  const existingMember = await prisma.membership.findFirst({
    where: { orgId: org.id, user: { email: parsed.data.email } },
  });
  if (existingMember) return { error: "That person is already a member" };

  const token = nanoid(32);
  await prisma.invite.upsert({
    where: { orgId_email: { orgId: org.id, email: parsed.data.email } },
    create: {
      orgId: org.id,
      email: parsed.data.email,
      role: parsed.data.role as Role,
      token,
      invitedBy: user.id,
      expires: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
    update: {
      role: parsed.data.role as Role,
      token,
      expires: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  // No mail provider wired yet — log the link so it's usable in dev.
  const url = `${process.env.AUTH_URL ?? "http://localhost:3000"}/invite/${token}`;
  logger.info({ email: parsed.data.email, url }, "member invite created");
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateMemberRole(formData: FormData): Promise<void> {
  const { org } = await requireOrg();
  assertRole(org.role, Role.OWNER);
  const membershipId = String(formData.get("membershipId"));
  const role = String(formData.get("role")) as Role;
  const target = await prisma.membership.findFirst({ where: { id: membershipId, orgId: org.id } });
  if (!target || target.role === Role.OWNER) return;
  await prisma.membership.update({ where: { id: membershipId }, data: { role } });
  revalidatePath("/settings");
}

export async function removeMember(formData: FormData): Promise<void> {
  const { org } = await requireOrg();
  assertRole(org.role, Role.ADMIN);
  const membershipId = String(formData.get("membershipId"));
  const target = await prisma.membership.findFirst({ where: { id: membershipId, orgId: org.id } });
  if (!target || target.role === Role.OWNER) return;
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/settings");
}

export async function createApiKey(_prev: Result, formData: FormData): Promise<Result> {
  const { user, org } = await requireOrg();
  assertRole(org.role, Role.ADMIN);
  const parsed = apiKeySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: "Enter a name for the key" };

  const { raw, prefix, hashedKey } = generateApiKey();
  await prisma.apiKey.create({
    data: { orgId: org.id, name: parsed.data.name, prefix, hashedKey, createdBy: user.id },
  });
  revalidatePath("/settings");
  return { ok: true, secret: raw };
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  const { org } = await requireOrg();
  assertRole(org.role, Role.ADMIN);
  const id = String(formData.get("id"));
  const key = await prisma.apiKey.findFirst({ where: { id, orgId: org.id } });
  if (!key) return;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/settings");
}
