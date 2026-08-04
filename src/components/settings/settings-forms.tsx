"use client";

import { useActionState, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { updateProfileAction, changePasswordAction } from "@/server/actions/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    address?: string | null;
    phone?: string | null;
    contactNumber?: string | null;
    notificationPrefs?: UserPrefs;
  };
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SettingsForms({ user }: SettingsFormsProps) {
  const prefs = user.notificationPrefs;
  const { update } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.image ?? "");
  const [avatarPending, setAvatarPending] = useState(false);

  const [, profileAction, profilePending] = useActionState(async (_prev: unknown, formData: FormData) => {
    const result = await updateProfileAction(formData);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    if (result?.ok) {
      const image = avatarUrl ? avatarUrl.split("?")[0] : undefined;
      await update({
        name: result.name,
        email: result.email,
        timezone: result.timezone,
        image,
      });
      toast.success("Profile updated");
    }
  }, null);

  const [, passwordAction, passwordPending] = useActionState(async (_prev: unknown, formData: FormData) => {
    const result = await changePasswordAction(formData);
    if (result?.error) toast.error(result.error);
    else {
      if (result?.mustChangePassword === false) {
        await update({ mustChangePassword: false });
      }
      toast.success("Password updated");
    }
  }, null);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be 2MB or smaller");
      e.target.value = "";
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WebP are allowed");
      e.target.value = "";
      return;
    }

    setAvatarPending(true);
    try {
      const body = new FormData();
      body.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const data = (await res.json()) as { error?: string; image?: string };
      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      if (data.image) {
        setAvatarUrl(`${data.image}?t=${Date.now()}`);
        await update({ image: data.image });
        toast.success("Profile photo updated");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setAvatarPending(false);
      e.target.value = "";
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.name} /> : null}
                <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarPending}
                className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
                aria-label="Upload profile photo"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onAvatarChange}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Profile photo</p>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP · max 2MB
                {avatarPending ? " · Uploading…" : ""}
              </p>
            </div>
          </div>

          <form action={profileAction} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.name} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={user.email}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={user.timezone ?? "UTC"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                defaultValue={user.address ?? ""}
                placeholder="Street, city, postal code"
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={user.phone ?? ""}
                  placeholder="+44 …"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactNumber">Contact number</Label>
                <Input
                  id="contactNumber"
                  name="contactNumber"
                  type="tel"
                  defaultValue={user.contactNumber ?? ""}
                  placeholder="Secondary / emergency"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium">Notification Preferences</p>
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
                    <Label htmlFor={key} className="font-normal">
                      {label}
                    </Label>
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
