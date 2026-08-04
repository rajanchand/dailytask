"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { inviteMemberAction } from "@/server/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "@/lib/utils";

export function InviteMemberForm() {
  const [, action, pending] = useActionState(async (_prev: unknown, formData: FormData) => {
    const result = await inviteMemberAction(formData);
    if (result?.error) toast.error(result.error);
    else toast.success(result?.message || "Invite email sent");
  }, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Team Member</CardTitle>
        <CardDescription>
          Enter name and email — the account is saved to the database and an invite with login
          details is emailed automatically (from noreply@zero-trust-security.org). They must change
          their password on first login.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <select id="role" name="role" className="h-10 rounded-lg border border-border bg-card px-3 text-sm" defaultValue="member">
              {Object.entries(ROLE_LABELS)
                .filter(([v]) => v !== "super_admin")
                .map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
