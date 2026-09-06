import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompt";

const ORG_COOKIE = "active_org";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    image: session.user.image ?? null,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

export interface ActiveOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  systemPrompt: string;
  role: Role;
}

/**
 * The org the current user is acting within. Chosen by the `active_org` cookie
 * when valid, otherwise the user's first membership. Throws if not signed in or
 * the user belongs to no org (should not happen — sign-up creates one).
 */
export async function requireOrg(): Promise<{ user: SessionUser; org: ActiveOrg }> {
  const user = await requireUser();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) throw Errors.forbidden("You do not belong to any organization");

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ORG_COOKIE)?.value;
  const chosen = memberships.find((m) => m.orgId === preferred) ?? memberships[0];

  return {
    user,
    org: {
      id: chosen.org.id,
      name: chosen.org.name,
      slug: chosen.org.slug,
      plan: chosen.org.plan,
      systemPrompt: chosen.org.systemPrompt,
      role: chosen.role,
    },
  };
}

const RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function assertRole(role: Role, minimum: Role) {
  if (RANK[role] < RANK[minimum]) throw Errors.forbidden(`Requires ${minimum} role`);
}

export async function listMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    include: { org: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Create a personal org + OWNER membership. Called on first sign-up. */
export async function createOrgForUser(userId: string, orgName: string) {
  const base = slugify(orgName) || "workspace";
  let slug = base;
  for (let i = 1; await prisma.organization.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }
  return prisma.organization.create({
    data: {
      name: orgName,
      slug,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      memberships: { create: { userId, role: Role.OWNER } },
    },
  });
}

export { ORG_COOKIE };
