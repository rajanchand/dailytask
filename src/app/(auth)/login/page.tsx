"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | undefined, formData: FormData) => {
      const result = await loginAction(formData);
      return result ?? undefined;
    },
    undefined,
  );

  return (
    <Card>
      <CardHeader className="text-center">
        <p className="text-2xl font-bold text-primary">Dailytask Manager</p>
        <CardTitle className="mt-2">Welcome back</CardTitle>
        <CardDescription>Sign in to manage your daily tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state?.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-2 text-center text-sm text-muted-foreground">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
          <p>
            No account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Register
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
