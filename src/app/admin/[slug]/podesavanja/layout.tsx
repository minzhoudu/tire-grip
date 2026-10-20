import { getDb } from "@/db";
import { SettingsRow } from "@/components/admin/settings/settings-row";
import { listSettingsSections } from "@/server/settings";
import { requireOwnerAccess } from "@/server/session";

/**
 * Desktop: category list stays visible in a left column while a category's
 * content shows on the right (no navigating away). Mobile keeps the
 * hub-then-subpage flow from page.tsx — this sidebar is desktop-only.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const sections = await listSettingsSections(getDb(), shop);

  return (
    <div className="md:flex md:items-start md:gap-6">
      <aside className="hidden md:block md:w-80 md:shrink-0">
        <div className="px-1 pb-3">
          <h1 className="font-mono text-xl font-bold">Podešavanja</h1>
          <p className="text-sm text-slate-600">Vidljivo samo vlasniku radnje.</p>
        </div>
        <div className="flex flex-col gap-2">
          {sections.map((s) => (
            <SettingsRow key={s.href} {...s} />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
