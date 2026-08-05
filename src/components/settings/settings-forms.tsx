"use client";

import { useActionState, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { updateProfileAction, changePasswordAction } from "@/server/actions/auth";
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

const NOTIFICATION_OPTS: [keyof UserPrefs, string][] = [
  ["morningReminder", "Morning reminder"],
  ["tomorrowPreview", "Tomorrow preview"],
  ["deadlineReminder", "Deadline reminder"],
  ["overdue", "Overdue alerts"],
  ["taskAssigned", "Task assigned"],
  ["taskCompleted", "Task completed"],
  ["dailySummary", "Daily summary"],
  ["emailEnabled", "Email"],
  ["inAppEnabled", "In-app"],
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 border-b border-border/70 pb-8 last:border-b-0 last:pb-0">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
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
      toast.success("Password updated. A confirmation email was sent.");
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
    <div className="mx-auto max-w-xl space-y-10">
      <form action={profileAction} className="space-y-10">
        <Section title="Profile" description="Your account details and contact info.">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-16 w-16">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.name} /> : null}
                <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarPending}
                className="absolute -bottom-0.5 -right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Upload profile photo"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onAvatarChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, or WebP · max 2MB
              {avatarPending ? " · Uploading…" : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Name">
              <Input id="name" name="name" defaultValue={user.name} required />
            </Field>
            <Field id="email" label="Email">
              <Input id="email" name="email" type="email" defaultValue={user.email} required />
            </Field>
            <Field id="timezone" label="Timezone" className="space-y-1.5 sm:col-span-2">
              <Input id="timezone" name="timezone" defaultValue={user.timezone ?? "UTC"} />
            </Field>
            <Field id="address" label="Address" className="space-y-1.5 sm:col-span-2">
              <Textarea
                id="address"
                name="address"
                defaultValue={user.address ?? ""}
                placeholder="Street, city, postal code"
                rows={2}
              />
            </Field>
            <Field id="phone" label="Phone">
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ""}
                placeholder="+44 …"
              />
            </Field>
            <Field id="contactNumber" label="Contact number">
              <Input
                id="contactNumber"
                name="contactNumber"
                type="tel"
                defaultValue={user.contactNumber ?? ""}
                placeholder="Secondary / emergency"
              />
            </Field>
          </div>
        </Section>

        <Section title="Notifications" description="Choose what you want to hear about.">
          <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {NOTIFICATION_OPTS.map(([key, label]) => (
              <label
                key={key}
                htmlFor={key}
                className="flex cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  id={key}
                  name={key}
                  defaultChecked={prefs ? prefs[key] : true}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Section>

        <div className="-mt-4">
          <Button type="submit" disabled={profilePending}>
            {profilePending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <Section title="Password" description="Update your sign-in password.">
        <form action={passwordAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="currentPassword" label="Current password">
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field id="newPassword" label="New password">
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Button type="submit" variant="outline" disabled={passwordPending}>
            {passwordPending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Section>
    </div>
  );
}
