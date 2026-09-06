"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signUpSchema } from "@/lib/validation";
import { createOrgForUser } from "@/lib/tenant";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { logger } from "@/lib/logger";

export type SignUpState = { error?: string };

export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists" };

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    await createOrgForUser(user.id, `${name.split(" ")[0]}'s workspace`);
  } catch (err) {
    logger.error({ err }, "sign-up failed");
    return { error: "Could not create your account. Please try again." };
  }

  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return {};
}

export async function signInAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
    return {};
  } catch (err) {
    if (err instanceof AuthError) return { error: "Invalid email or password" };
    throw err; // redirect() throws — must propagate
  }
}
