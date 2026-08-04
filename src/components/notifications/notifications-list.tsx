"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationAction,
} from "@/server/actions/notifications";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: Date;
};

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markAllNotificationsRead();
              toast.success("All marked as read");
              router.refresh();
            })
          }
        >
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <Bell className="h-10 w-10 mb-3 opacity-40" />
            <p>No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={cn(!n.read && "border-primary/30 bg-accent/30")}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{n.title}</p>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                  {n.link && (
                    <Link href={n.link} className="text-sm text-primary hover:underline mt-1 inline-block">
                      View →
                    </Link>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await markNotificationRead(n.id);
                          router.refresh();
                        })
                      }
                    >
                      Read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    aria-label="Delete"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteNotificationAction(n.id);
                        toast.success("Deleted");
                        router.refresh();
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
