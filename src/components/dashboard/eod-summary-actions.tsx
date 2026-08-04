"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  moveRemainingToTomorrowAction,
  completeRemainingAction,
  dismissDailySummaryAction,
} from "@/server/actions/tasks";

export function EodSummaryActions({ date }: { date: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok?: boolean; error?: string; count?: number }>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(message);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => moveRemainingToTomorrowAction(date), "Tasks moved to tomorrow")}
      >
        Move to Tomorrow
      </Button>
      <Button
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() => run(() => completeRemainingAction(date), "Remaining tasks completed")}
      >
        Complete Remaining
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => dismissDailySummaryAction(date), "Summary dismissed")}
      >
        Dismiss
      </Button>
    </div>
  );
}
