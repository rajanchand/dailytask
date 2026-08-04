"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, Suspense } from "react";
import { resetPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | undefined, formData: FormData) => {
      return (await resetPasswordAction(formData)) ?? undefined;
    },
    undefined,
  );

  if (!token) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Invalid or missing reset token.{" "}
          <Link href="/forgot-password" className="text-primary hover:underline">
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <p className="text-2xl font-bold text-primary">Dailytask Manager</p>
        <CardTitle className="mt-2">Reset password</CardTitle>
        <CardDescription>Choose a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {state?.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Resetting…" : "Reset password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
