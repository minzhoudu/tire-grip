import QRCode from "qrcode";
import { SubpageHeader } from "@/components/admin/settings/subpage-header";
import { getOrigin, shopPublicUrl } from "@/server/origin";
import { getAdminBase, requireOwnerAccess } from "@/server/session";
import { LinkActions, PrintButton } from "./link-actions";

export default async function ShopLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { shop } = await requireOwnerAccess(slug);
  const url = shopPublicUrl(shop.slug, await getOrigin());
  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const [qrSvg, qrPng] = await Promise.all([
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
  ]);

  return (
    <>
      <div className="flex flex-col gap-4 print:hidden!">
        <SubpageHeader
          base={await getAdminBase(slug)}
          title="Link i QR kod za kupce"
          description="Preko ovog linka kupci zakazuju. Podelite ga gde god vas kupci traže, a QR kod odštampajte za pult ili vrata."
        />

        <div className="rounded-2xl border-2 border-navy-900 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Vaš link</p>
          <p className="mt-1 font-mono text-base font-bold break-all">{displayUrl}</p>
          <p className="mt-1 text-xs text-slate-500">Stavite ga na Google profil radnje, Instagram, Facebook ili pošaljite kupcu na WhatsApp.</p>
          <LinkActions url={url} shopName={shop.name} />
        </div>

        <div className="flex flex-col items-center rounded-2xl border-2 border-navy-900 bg-white p-5 text-center">
          <p className="self-start text-sm font-semibold text-slate-700">QR kod</p>
          {/* Generated from our own URL, contains only SVG paths. */}
          <div className="mt-3 w-56 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-3 text-xs text-slate-500">Kupac usmeri kameru telefona na kod i odmah mu se otvori zakazivanje.</p>
          <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row">
            <a
              href={qrPng}
              download={`qr-${shop.slug}.png`}
              className="flex-1 rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Preuzmi QR (slika)
            </a>
            <PrintButton />
          </div>
        </div>
      </div>

      {/* Print-only poster: everything else on the page (and the admin chrome) is hidden when printing. */}
      <div className="hidden flex-col items-center pt-8 text-center print:flex!">
        <p className="font-mono text-5xl font-bold">{shop.name}</p>
        <p className="mt-6 text-3xl font-semibold">Zakažite termin online</p>
        <p className="mt-2 text-xl">Usmerite kameru telefona na kod</p>
        <div className="mt-8 w-[11cm] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="mt-6 font-mono text-2xl font-bold">{displayUrl}</p>
        <p className="mt-2 text-lg">Bez zvanja i bez čekanja u redu.</p>
      </div>
    </>
  );
}
