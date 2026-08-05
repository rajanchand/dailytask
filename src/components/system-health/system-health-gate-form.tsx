"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  lockSystemHealthAction,
  setupSystemHealthAction,
  unblockSystemHealthAction,
  unlockSystemHealthAction,
  unlockSystemHealthDatabaseAction,
  unlockSystemHealthDatabaseWithPinAction,
  unlockSystemHealthWithPinAction,
} from "@/server/actions/system-health-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ActionState = {
  error?: string;
  ok?: boolean;
  offerPin?: boolean;
  locked?: boolean;
  remaining?: number;
  needsSetup?: boolean;
};

export function SystemHealthSetupForm() {
  const [state, action, pending] = useActionState(
    async (_prev: ActionState | undefined, formData: FormData) => {
      return setupSystemHealthAction(formData);
    },
    undefined,
  );

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Set up System Health access</CardTitle>
        <CardDescription>
          First-time setup for the dedicated ops gate (separate from your normal login). Store a
          memorable 6-digit code for recovery if the password fails.
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
            <Label htmlFor="sh-setup-email">Ops email</Label>
            <Input
              id="sh-setup-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="ops@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh-setup-password">System Health password</Label>
            <Input
              id="sh-setup-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh-setup-confirm">Confirm password</Label>
            <Input
              id="sh-setup-confirm"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh-setup-pin">6-digit memorable code</Label>
            <Input
              id="sh-setup-pin"
              name="pin"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="off"
              placeholder="••••••"
            />
            <p className="text-xs text-muted-foreground">
              Digits only. Hashed in the database — you will need this if password unlock fails.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save and unlock"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SystemHealthUnlockForm({
  initialOfferPin = false,
}: {
  initialOfferPin?: boolean;
}) {
  const [step, setStep] = useState<"password" | "pin">(initialOfferPin ? "pin" : "password");

  const [passwordState, passwordAction, passwordPending] = useActionState(
    async (_prev: ActionState | undefined, formData: FormData) => {
      const result = await unlockSystemHealthAction(formData);
      if (result.offerPin) setStep("pin");
      if (result.locked) setStep("password");
      return result;
    },
    undefined,
  );

  const [pinState, pinAction, pinPending] = useActionState(
    async (_prev: ActionState | undefined, formData: FormData) => {
      return unlockSystemHealthWithPinAction(formData);
    },
    undefined,
  );

  const activeError = step === "pin" ? pinState?.error : passwordState?.error;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Unlock System Health</CardTitle>
        <CardDescription>
          Super Admin login alone is not enough. Enter the dedicated System Health ops credentials
          (separate from your normal account password).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {activeError}
          </p>
        )}

        {step === "password" ? (
          <form action={passwordAction} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={passwordPending}>
              {passwordPending ? "Verifying…" : "Unlock"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setStep("pin")}
            >
              Unable to log in? Use memorable code
            </button>
          </form>
        ) : (
          <form action={pinAction} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit memorable code from setup. Failed PIN attempts count toward the same
              lockout limit.
            </p>
            <div className="space-y-2">
              <Label htmlFor="sh-pin">Memorable code</Label>
              <Input
                id="sh-pin"
                name="pin"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="off"
                placeholder="••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pinPending}>
              {pinPending ? "Verifying…" : "Unlock with code"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setStep("password")}
            >
              Back to password
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function SystemHealthBlockedPanel() {
  const [state, action, pending] = useActionState(
    async () => {
      return unblockSystemHealthAction();
    },
    undefined,
  );

  return (
    <Card className="mx-auto max-w-lg border-destructive/40">
      <CardHeader>
        <CardTitle>System Health is blocked</CardTitle>
        <CardDescription>
          Too many failed unlock attempts. Ops password / memorable code unlock is refused until a
          super admin unblocks access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state?.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            Unblocked. You can unlock with ops credentials again.
          </p>
        )}
        <form action={action}>
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Unblocking…" : "Unblock System Health"}
          </Button>
        </form>
        <div className="rounded-lg bg-muted/60 px-3 py-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Manual SQL unblock (database)</p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {`UPDATE system_health_credentials
SET locked = false,
    locked_at = NULL,
    failed_count = 0,
    updated_at = NOW();`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemHealthLockButton() {
  const [, action, pending] = useActionState(
    async () => {
      return lockSystemHealthAction();
    },
    undefined,
  );

  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Locking…" : "Lock System Health"}
      </Button>
    </form>
  );
}

type DbChallengeState = {
  error?: string;
  ok?: boolean;
  offerPin?: boolean;
  locked?: boolean;
  remaining?: number;
  needsSetup?: boolean;
  needsOpsUnlock?: boolean;
};

export function SystemHealthDatabaseChallengeForm({
  pinAvailable = true,
}: {
  pinAvailable?: boolean;
}) {
  const [step, setStep] = useState<"password" | "pin">("password");
  const router = useRouter();

  const [passwordState, passwordAction, passwordPending] = useActionState(
    async (_prev: DbChallengeState | undefined, formData: FormData) => {
      const result = await unlockSystemHealthDatabaseAction(formData);
      if (result.offerPin && pinAvailable) setStep("pin");
      if (result.ok) {
        router.refresh();
      } else if (result.locked || result.needsOpsUnlock) {
        router.push("/system-health");
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  const [pinState, pinAction, pinPending] = useActionState(
    async (_prev: DbChallengeState | undefined, formData: FormData) => {
      const result = await unlockSystemHealthDatabaseWithPinAction(formData);
      if (result.ok) {
        router.refresh();
      } else if (result.locked || result.needsOpsUnlock) {
        router.push("/system-health");
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  const activeError = step === "pin" ? pinState?.error : passwordState?.error;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Confirm database access</CardTitle>
        <CardDescription>
          Database console needs a second check. Re-enter the System Health password or 6-digit
          memorable code. This is separate from the main unlock and expires after 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {activeError}
          </p>
        )}

        {step === "password" ? (
          <form action={passwordAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sh-db-email">Ops email</Label>
              <Input
                id="sh-db-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="ops@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sh-db-password">System Health password</Label>
              <Input
                id="sh-db-password"
                name="password"
                type="password"
                required
                autoComplete="off"
              />
            </div>
            <Button type="submit" className="w-full" disabled={passwordPending}>
              {passwordPending ? "Verifying…" : "Open database"}
            </Button>
            {pinAvailable ? (
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setStep("pin")}
              >
                Use memorable code instead
              </button>
            ) : null}
          </form>
        ) : (
          <form action={pinAction} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit memorable code from System Health setup. Failed attempts count
              toward the same lockout limit.
            </p>
            <div className="space-y-2">
              <Label htmlFor="sh-db-pin">Memorable code</Label>
              <Input
                id="sh-db-pin"
                name="pin"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="off"
                placeholder="••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pinPending}>
              {pinPending ? "Verifying…" : "Open database with code"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setStep("password")}
            >
              Back to password
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
