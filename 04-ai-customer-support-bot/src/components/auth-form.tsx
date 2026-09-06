"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { signInAction, signUpAction, type SignUpState } from "@/app/(auth)/actions";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const action = mode === "sign-in" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(action, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {mode === "sign-up" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              No account?{" "}
              <Link href="/sign-up" className="text-primary hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
        {mode === "sign-in" && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Demo: demo@example.com / demo12345
          </p>
        )}
      </CardContent>
    </Card>
  );
}
