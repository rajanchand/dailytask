"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import {
  saveDiscordIntegrationAction,
  testDiscordIntegrationAction,
} from "@/server/actions/discord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Integration = {
  teamId: string;
  teamName?: string;
  webhookUrl?: string;
  serverName?: string | null;
  channelName?: string | null;
  enabled?: boolean;
  eventTypes?: Record<string, boolean>;
};

const EVENT_OPTS = [
  ["taskCreated", "Task created"],
  ["taskAssigned", "Task assigned"],
  ["statusChanged", "Status changed"],
  ["taskCompleted", "Task completed"],
  ["taskOverdue", "Task overdue"],
  ["morningReminder", "Morning reminder"],
  ["dailySummary", "Daily summary"],
] as const;

const COMMANDS = [
  ["today task", "Today's task list"],
  ["today total task update", "Totals & progress"],
  ["today complete task", "Completed today"],
  ["today pending", "Remaining tasks"],
  ["report", "Full daily report"],
  ["weekly report", "Last 7 days"],
  ["help", "Command menu"],
] as const;

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function DiscordSettingsForm({ integration }: { integration: Integration | null }) {
  const events = integration?.eventTypes ?? null;
  const [testing, startTest] = useTransition();

  const [, action, pending] = useActionState(async (_prev: unknown, formData: FormData) => {
    const result = await saveDiscordIntegrationAction(formData);
    if (result?.error) toast.error(result.error);
    else toast.success("Discord settings saved");
  }, null);

  function handleTest() {
    startTest(async () => {
      const result = await testDiscordIntegrationAction();
      if (result?.error) toast.error(result.error);
      else toast.success("Test message sent to Discord");
    });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-5 border-b border-border/70 pb-8">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Webhook</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send task updates to {integration?.teamName ?? "your team"} via Discord.
          </p>
        </div>

        <ol className="space-y-1 text-sm text-muted-foreground">
          <li>1. Channel settings → Integrations → Webhooks</li>
          <li>2. Create a webhook and paste the URL below</li>
          <li>3. Choose events, save, then test</li>
        </ol>

        <form action={action} className="space-y-5">
          <input type="hidden" name="teamId" value={integration?.teamId ?? ""} />

          <Field id="webhookUrl" label="Webhook URL">
            <Input
              id="webhookUrl"
              name="webhookUrl"
              required
              type="url"
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/..."
              defaultValue={integration?.webhookUrl ?? ""}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="serverName" label="Server name">
              <Input
                id="serverName"
                name="serverName"
                defaultValue={integration?.serverName ?? ""}
                placeholder="Ops Team"
              />
            </Field>
            <Field id="channelName" label="Channel name">
              <Input
                id="channelName"
                name="channelName"
                defaultValue={integration?.channelName ?? ""}
                placeholder="#dailyflow"
              />
            </Field>
          </div>

          <label htmlFor="enabled" className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              id="enabled"
              name="enabled"
              defaultChecked={integration?.enabled ?? true}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            <span>Enable integration</span>
          </label>

          <div className="space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground">Events</p>
            <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {EVENT_OPTS.map(([key, label]) => (
                <label
                  key={key}
                  htmlFor={key}
                  className="flex cursor-pointer items-center gap-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    id={key}
                    name={key}
                    defaultChecked={events ? events[key] : true}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testing || !integration?.webhookUrl}
              onClick={handleTest}
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Bot commands</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Keyword replies when the Discord bot is running.
          </p>
        </div>
        <dl className="space-y-2 text-sm">
          {COMMANDS.map(([cmd, desc]) => (
            <div key={cmd} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt>
                <code className="text-xs text-foreground">{cmd}</code>
              </dt>
              <dd className="text-muted-foreground">{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Run <code className="text-foreground">pnpm discord:bot</code> with{" "}
          <code className="text-foreground">DISCORD_BOT_TOKEN</code> set.
        </p>
      </section>
    </div>
  );
}
