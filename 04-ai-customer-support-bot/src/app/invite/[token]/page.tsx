import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, ORG_COOKIE } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token }, include: { org: true } });

  if (!invite || invite.acceptedAt || invite.expires < new Date()) {
    return <Centered>This invitation link is invalid or has expired.</Centered>;
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?callbackUrl=/invite/${token}`);
  }

  if (user!.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Centered>
        This invite is for <strong>{invite.email}</strong>, but you are signed in as{" "}
        <strong>{user!.email}</strong>.
      </Centered>
    );
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_orgId: { userId: user!.id, orgId: invite.orgId } },
      create: { userId: user!.id, orgId: invite.orgId, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.invite.update({ where: { token }, data: { acceptedAt: new Date() } }),
  ]);

  (await cookies()).set(ORG_COOKIE, invite.orgId, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/dashboard");
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      <Link href="/dashboard" className="text-sm text-primary hover:underline">
        Go to dashboard
      </Link>
    </div>
  );
}
