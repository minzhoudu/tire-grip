import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { DeleteCampaignButton } from "@/components/admin/reminders/delete-campaign-button";
import { GenerateQueueButton } from "@/components/admin/reminders/generate-queue-button";
import { SendQueue } from "@/components/admin/reminders/send-queue";
import { reminderMessage } from "@/lib/booking/messages";
import { whatsappLink } from "@/lib/phone";
import { hasFeature } from "@/lib/plan";
import { getOrigin } from "@/server/origin";
import { listCampaigns, listTodayQueue, previewAudience } from "@/server/reminders";
import { getAdminBase, requireOwnerAccess } from "@/server/session";

const SEASON_ICON: Record<string, string> = { winter: "❄️", summer: "☀️" };

export default async function CampaignPage({ params }: { params: Promise<{ slug: string; campaignId: string }> }) {
  const { slug, campaignId } = await params;
  const { shop } = await requireOwnerAccess(slug);
  if (!hasFeature(shop.plan, "podsetnici")) notFound();
  const [campaigns, base] = await Promise.all([listCampaigns(getDb(), shop.id), getAdminBase(slug)]);
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) notFound();
  const listHref = `${base}/podsetnici`;

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <Link href={listHref} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 active:opacity-60">
          <span aria-hidden>‹</span> Sve kampanje
        </Link>
        <h1 className="mt-1 font-mono text-xl font-bold">
          {SEASON_ICON[campaign.season]} {campaign.name}
        </h1>
        <p className="text-sm text-slate-600">„{campaign.messageTemplate}"</p>
      </div>

      {campaign.status === "draft" ? (
        <DraftView slug={slug} campaignId={campaignId} shopId={shop.id} />
      ) : (
        <ActiveOrDoneView slug={slug} campaignId={campaignId} shopId={shop.id} shopName={shop.name} template={campaign.messageTemplate} />
      )}

      <DeleteCampaignButton slug={slug} campaignId={campaignId} sentCount={campaign.sent + campaign.booked} listHref={listHref} />
    </div>
  );
}

async function DraftView({ slug, campaignId, shopId }: { slug: string; campaignId: string; shopId: string }) {
  const count = await previewAudience(getDb(), shopId);
  return (
    <div className="rounded-2xl border-2 border-navy-900 bg-white p-4">
      <p>
        {count === 0 ? (
          "Nema kupaca sa pristankom i istorijom zamene guma za podsetnik."
        ) : (
          <>
            Pronađeno <strong>{count}</strong> {count === 1 ? "kupac" : "kupaca"} sa pristankom za podsetnike i prethodnom zamenom guma.
          </>
        )}
      </p>
      {count > 0 && <GenerateQueueButton slug={slug} campaignId={campaignId} />}
    </div>
  );
}

async function ActiveOrDoneView({
  slug,
  campaignId,
  shopId,
  shopName,
  template,
}: {
  slug: string;
  campaignId: string;
  shopId: string;
  shopName: string;
  template: string;
}) {
  const [queue, origin] = await Promise.all([listTodayQueue(getDb(), shopId, campaignId), getOrigin()]);
  const items = queue.map((q) => ({
    id: q.id,
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    waLink: whatsappLink(q.customerPhone, reminderMessage(template, { ime: q.customerName, link: `${origin}/r/${q.token}`, radnja: shopName })),
  }));

  if (items.length === 0) {
    return <p className="rounded-2xl border-2 border-navy-900 bg-white p-4 text-slate-600">Nema više nikog za slanje danas. Kampanja je završena ili je lista potpuno poslata.</p>;
  }

  return (
    <div>
      <p className="mb-2 px-1 text-sm font-semibold text-slate-700">Danas za slanje ({items.length})</p>
      <SendQueue slug={slug} campaignId={campaignId} items={items} />
    </div>
  );
}
