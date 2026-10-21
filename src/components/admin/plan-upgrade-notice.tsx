/** Shown instead of a gated page's content when the shop's plan doesn't include that feature (e.g. Basic). */
export function PlanUpgradeNotice({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-navy-900 bg-white p-8 text-center">
      <span aria-hidden className="text-3xl">
        🔒
      </span>
      <p className="font-semibold text-slate-900">{feature} nije uključeno u vaš plan.</p>
      <p className="text-sm text-slate-600">Kontaktirajte nas za nadogradnju plana.</p>
    </div>
  );
}
