import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { SettingsForms } from "@/components/settings/settings-forms";

export default async function SettingsPage() {
  const session = await auth();
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      timezone: users.timezone,
      image: users.image,
      address: users.address,
      phone: users.phone,
      contactNumber: users.contactNumber,
      notificationPrefs: users.notificationPrefs,
    })
    .from(users)
    .where(eq(users.id, session!.user!.id))
    .limit(1);

  if (!user) return null;

  return (
    <div className="animate-fade-up px-0.5">
      <SettingsForms user={user} />
    </div>
  );
}
