"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import {
  saveDiscordIntegrationAction,
  testDiscordIntegrationAction,
} from "@/server/actions/discord";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Discord Integration</CardTitle>
        <CardDescription>
          Connect a Discord webhook to receive task updates for{" "}
          {integration?.teamName ?? "your team"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="mb-6 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open your Discord server → channel settings → Integrations → Webhooks</li>
          <li>Create a webhook and copy its URL</li>
          <li>Paste it below, choose events, then Save</li>
          <li>Click Test Connection to verify outbound alerts</li>
        </ol>

        <div className="mb-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <p className="mb-2 font-medium">Keyword commands (Discord bot)</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>
              <code className="text-foreground">today task</code> — today&apos;s task list
            </li>
            <li>
              <code className="text-foreground">today total task update</code> — totals &amp; progress
            </li>
            <li>
              <code className="text-foreground">today complete task</code> — completed today
            </li>
            <li>
              <code className="text-foreground">today pending</code> — remaining tasks
            </li>
            <li>
              <code className="text-foreground">report</code> / <code className="text-foreground">daily report</code> — full daily report
            </li>
            <li>
              <code className="text-foreground">weekly report</code> — last 7 days
            </li>
            <li>
              <code className="text-foreground">help</code> — command menu
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Run <code className="text-foreground">pnpm discord:bot</code> with{" "}
            <code className="text-foreground">DISCORD_BOT_TOKEN</code> set to reply live in-channel.
          </p>
        </div>

        <form action={action} className="space-y-6">
          <input type="hidden" name="teamId" value={integration?.teamId ?? ""} />

          <div className="grid gap-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              name="webhookUrl"
              required
              type="password"
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/..."
              defaultValue={integration?.webhookUrl ?? ""}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="serverName">Server Name</Label>
              <Input
                id="serverName"
                name="serverName"
                defaultValue={integration?.serverName ?? ""}
                placeholder="Ops Team"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="channelName">Channel Name</Label>
              <Input
                id="channelName"
                name="channelName"
                defaultValue={integration?.channelName ?? ""}
                placeholder="#dailyflow"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enabled"
              name="enabled"
              defaultChecked={integration?.enabled ?? true}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="enabled">Enable integration</Label>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium">Event Types</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["taskCreated", "Task Created"],
                ["taskAssigned", "Task Assigned"],
                ["statusChanged", "Status Changed"],
                ["taskCompleted", "Task Completed"],
                ["taskOverdue", "Task Overdue"],
                ["morningReminder", "Morning Reminder"],
                ["dailySummary", "Daily Summary"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={key}
                    name={key}
                    defaultChecked={events ? events[key] : true}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor={key} className="font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testing || !integration?.webhookUrl}
              onClick={handleTest}
            >
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
