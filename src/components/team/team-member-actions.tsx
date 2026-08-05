"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/utils";

type Props = {
  userId: string;
  role: string;
  disabled: boolean;
  updateRole: (userId: string, role: string) => Promise<void>;
  setDisabled: (userId: string, disabled: boolean) => Promise<void>;
  remove: (userId: string) => Promise<void>;
};

export function TeamMemberActions({ userId, role, disabled, updateRole, setDisabled, remove }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={role}
        disabled={pending}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs"
        onChange={(e) => {
          startTransition(async () => {
            await updateRole(userId, e.target.value);
            toast.success("Role updated");
            router.refresh();
          });
        }}
      >
        {ASSIGNABLE_ROLES.map((v) => (
          <option key={v} value={v}>{ROLE_LABELS[v]}</option>
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
