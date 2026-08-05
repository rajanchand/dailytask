"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { forgotPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";

type State = { ok?: boolean; message?: string; resetUrl?: string; error?: string };

export default function ForgotPasswordPage() {
  const lastToast = useRef<string | null>(null);
  const [state, action, pending] = useActionState(
    async (_prev: State | undefined, formData: FormData) => {
      return (await forgotPasswordAction(formData)) as State;
    },
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    const key = state.error ?? state.message ?? "";
    if (!key || lastToast.current === key) return;
    lastToast.current = key;
    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader className="text-center">
        <p className="text-2xl font-bold text-primary">{APP_NAME}</p>
        <CardTitle className="mt-2">Forgot password</CardTitle>
        <CardDescription>Enter your email to receive a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state?.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state?.ok && state.message && (
            <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
              {state.message}
            </p>
          )}
          {state?.resetUrl && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm break-all">
              Reset link:{" "}
              <Link href={state.resetUrl} className="text-primary hover:underline">
                {state.resetUrl}
              </Link>
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@example.com" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
