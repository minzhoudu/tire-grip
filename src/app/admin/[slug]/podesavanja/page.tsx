import { getDb } from "@/db";
import { SettingsRow } from "@/components/admin/settings/settings-row";
import { listSettingsSections } from "@/server/settings";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

export default async function SettingsHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const sections = await listSettingsSections(getDb(), shop, await getAdminBase(slug));

  return (
    <>
      {/* Mobile: the category list lives here. Desktop: it's already in the sidebar (layout.tsx). */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="px-1">
          <h1 className="font-mono text-xl font-bold">Podešavanja</h1>
          <p className="text-sm text-slate-600">Vidljivo samo vlasniku radnje.</p>
        </div>
        {sections.map((s) => (
          <SettingsRow key={s.href} {...s} />
        ))}
      </div>

      <div className="hidden flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-6 py-16 text-center text-slate-400 md:flex">
        <p className="text-4xl" aria-hidden>
          ⚙️
        </p>
        <p className="font-semibold">Izaberite kategoriju sa leve strane</p>
      </div>
    </>
  );
}
