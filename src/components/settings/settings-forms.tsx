"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { updateProfileAction, changePasswordAction } from "@/server/actions/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserPrefs = {
  morningReminder?: boolean;
  tomorrowPreview?: boolean;
  deadlineReminder?: boolean;
  overdue?: boolean;
  taskAssigned?: boolean;
  taskCompleted?: boolean;
  dailySummary?: boolean;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
};

type SettingsFormsProps = {
  user: {
    name: string;
    email: string;
    timezone: string;
    image?: string | null;
    notificationPrefs?: UserPrefs;
  };
};

export function SettingsForms({ user }: SettingsFormsProps) {
  const prefs = user.notificationPrefs;

  const [, profileAction, profilePending] = useActionState(async (_prev: unknown, formData: FormData) => {
    const result = await updateProfileAction(formData);
    if (result?.ok) toast.success("Profile updated");
  }, null);

  const [, passwordAction, passwordPending] = useActionState(async (_prev: unknown, formData: FormData) => {
    const result = await changePasswordAction(formData);
    if (result?.error) toast.error(result.error);
    else toast.success("Password updated");
  }, null);

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.name} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} disabled />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={user.timezone ?? "UTC"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="image">Avatar URL</Label>
              <Input id="image" name="image" defaultValue={user.image ?? ""} placeholder="https://..." />
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-3">Notification Preferences</p>
              <div className="grid gap-3">
                {[
                  ["morningReminder", "Morning Reminder"],
                  ["tomorrowPreview", "Tomorrow Task Preview"],
                  ["deadlineReminder", "Deadline Reminder"],
                  ["overdue", "Overdue Alerts"],
                  ["taskAssigned", "Task Assigned"],
                  ["taskCompleted", "Task Completed"],
                  ["dailySummary", "Daily Summary"],
                  ["emailEnabled", "Email Notifications"],
                  ["inAppEnabled", "In-App Notifications"],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={key}
                      name={key}
                      defaultChecked={prefs ? prefs[key as keyof UserPrefs] : true}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <Label htmlFor={key} className="font-normal">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={profilePending}>
              {profilePending ? "Saving…" : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" name="currentPassword" type="password" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" name="newPassword" type="password" required minLength={8} />
            </div>
            <Button type="submit" disabled={passwordPending}>
              {passwordPending ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
