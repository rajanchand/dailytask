import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { SettingsForms } from "@/components/settings/settings-forms";

export default async function SettingsPage() {
  const session = await auth();
  const [user] = await db.select().from(users).where(eq(users.id, session!.user!.id)).limit(1);

  if (!user) return null;

  return (
    <div className="animate-fade-up">
      <SettingsForms user={user} />
    </div>
  );
}
