import { getDb } from "@/db";
import { NotificationSettings } from "@/components/admin/push/notification-settings";
import { getNotificationSettings } from "@/server/notifications";
import { vapidPublicKey } from "@/server/push";
import { requireShopAccess } from "@/server/session";

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop, user, isImpersonating } = await requireShopAccess(slug);
  const settings = await getNotificationSettings(getDb(), shop.id, user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="font-mono text-xl font-bold">Obaveštenja</h1>
        <p className="text-sm text-slate-600">Novi zahtevi i otkazivanja stižu vam na telefon, kao poruka.</p>
      </div>
      <NotificationSettings
        slug={slug}
        vapidPublicKey={vapidPublicKey()}
        email={user.email}
        emailNotifications={settings.emailNotifications}
        deviceCount={settings.deviceCount}
        isImpersonating={isImpersonating}
      />
    </div>
  );
}
