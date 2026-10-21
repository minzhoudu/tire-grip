/** Shown by loading.tsx boundaries while a server-rendered page fetches its data. */
export function Spinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="grid size-12 animate-spin place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
        🛞
      </div>
    </div>
  );
}
