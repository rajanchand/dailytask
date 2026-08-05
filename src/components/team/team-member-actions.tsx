"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAssignableRoles, ROLE_LABELS } from "@/lib/utils";

type Props = {
  userId: string;
  role: string;
  disabled: boolean;
  actorRole?: string | null;
  updateRole: (userId: string, role: string) => Promise<void>;
  setDisabled: (userId: string, disabled: boolean) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  resetPassword: (
    userId: string,
  ) => Promise<{ ok?: true; message?: string; error?: string; resetUrl?: string }>;
};

export function TeamMemberActions({
  userId,
  role,
  disabled,
  actorRole,
  updateRole,
  setDisabled,
  remove,
  resetPassword,
}: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const roles = getAssignableRoles(actorRole);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        defaultValue={role}
        disabled={pending}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs"
        onChange={(e) => {
          startTransition(async () => {
            try {
              await updateRole(userId, e.target.value);
              toast.success("Role updated");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to update role");
              router.refresh();
            }
          });
        }}
      >
        {roles.map((v) => (
          <option key={v} value={v}>
            {ROLE_LABELS[v]}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setDisabled(userId, !disabled);
            toast.success(disabled ? "Member enabled" : "Member disabled");
            router.refresh();
          })
        }
      >
        {disabled ? "Enable" : "Disable"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending || disabled}
        onClick={() => {
          if (
            !window.confirm(
              "Send a password reset email to this member’s registered email address?",
            )
          ) {
            return;
          }
          startTransition(async () => {
            const result = await resetPassword(userId);
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            toast.success(result?.message || "Password reset email sent");
            if (result?.resetUrl) {
              toast.message(`Dev reset link: ${result.resetUrl}`);
            }
          });
        }}
      >
        Reset password
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Remove this member from the team?")) return;
          startTransition(async () => {
            await remove(userId);
            toast.success("Member removed");
            router.refresh();
          });
        }}
      >
        Remove
      </Button>
    </div>
  );
}
