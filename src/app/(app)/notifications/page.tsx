import { getNotifications } from "@/server/actions/notifications";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default async function NotificationsPage() {
  const notifications = await getNotifications();
  return <NotificationsList notifications={notifications} />;
}
