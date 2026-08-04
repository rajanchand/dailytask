import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { AccessDenied } from "@/components/access-denied";
import { getDiscordIntegration } from "@/server/actions/discord";
import { DiscordSettingsForm } from "@/components/discord/discord-settings-form";

export default async function DiscordPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "discord.manage")) {
    return <AccessDenied title="Discord settings require admin access" />;
  }

  const integration = await getDiscordIntegration();

  const formData = integration
    ? {
        teamId: integration.teamId,
        teamName: "teamName" in integration ? integration.teamName : undefined,
        webhookUrl: "webhookUrl" in integration ? integration.webhookUrl : undefined,
        serverName: "serverName" in integration ? integration.serverName : undefined,
        channelName: "channelName" in integration ? integration.channelName : undefined,
        enabled: "enabled" in integration ? integration.enabled : true,
        eventTypes: "eventTypes" in integration ? integration.eventTypes : undefined,
      }
    : null;

  return (
    <div className="max-w-2xl animate-fade-up">
      <DiscordSettingsForm integration={formData} />
    </div>
  );
}
