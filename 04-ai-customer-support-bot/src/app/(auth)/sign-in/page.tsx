import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/tenant";
import { AuthForm } from "@/components/auth-form";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="sign-in" />;
}
