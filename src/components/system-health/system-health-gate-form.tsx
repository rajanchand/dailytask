"use client";

import { useActionState } from "react";
import {
  lockSystemHealthAction,
  unlockSystemHealthAction,
} from "@/server/actions/system-health-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SystemHealthUnlockForm() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) => {
      return unlockSystemHealthAction(formData);
    },
    undefined,
  );

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Unlock System Health</CardTitle>
        <CardDescription>
          Super Admin login alone is not enough. Enter the dedicated System Health ops email and
          password (separate from your normal account password).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state?.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="sh-email">Ops email</Label>
            <Input
              id="sh-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="ops@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh-password">Ops password</Label>
            <Input
              id="sh-password"
              name="password"
              type="password"
              required
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Verifying…" : "Unlock"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SystemHealthLockButton() {
  const [state, action, pending] = useActionState(
    async (_prev: { ok?: boolean } | undefined) => {
      return lockSystemHealthAction();
    },
    undefined,
  );

  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Locking…" : "Lock System Health"}
      </Button>
      {state?.ok ? null : null}
    </form>
  );
}
