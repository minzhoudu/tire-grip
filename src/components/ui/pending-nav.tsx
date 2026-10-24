"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useTransition } from "react";

const NavContext = createContext<{ go: (href: string) => void; pending: boolean }>({ go: () => {}, pending: false });
export const usePendingNav = () => useContext(NavContext);

/** A navigation that lands this fast was served from the prefetch cache, not a fresh server render. */
const FROM_CACHE_MS = 400;

/**
 * For navigations that only change searchParams on the same page (tabs, days), where loading.tsx
 * doesn't show: `go()` exposes a pending state for spinners/dimming. A view that came from the
 * prefetch cache (see PendingLink) is refreshed once in the background so it can't stay stale.
 * `routeKey` must change with every view (e.g. the search params).
 */
export function PendingNavProvider({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navStartedAt = useRef<number | null>(null);

  const go = useCallback(
    (href: string) => {
      navStartedAt.current = performance.now();
      startTransition(() => router.push(href));
    },
    [router],
  );

  useEffect(() => {
    if (navStartedAt.current === null) return;
    const fromCache = performance.now() - navStartedAt.current < FROM_CACHE_MS;
    navStartedAt.current = null;
    if (fromCache) router.refresh();
  }, [routeKey, router]);

  return <NavContext.Provider value={{ go, pending }}>{children}</NavContext.Provider>;
}

/**
 * A real link (opens in a new tab, long-press works) whose click goes through `go()` for the pending
 * feedback. `prefetch` (production only) loads the whole page with its data while the link is on
 * screen, so the click is usually instant; plain router.prefetch() would only fetch the loading shell.
 */
export function PendingLink({
  href,
  prefetch,
  onClick,
  ...rest
}: Omit<React.ComponentProps<typeof Link>, "href" | "onNavigate"> & { href: string }) {
  const { go } = usePendingNav();
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={onClick}
      onNavigate={(e) => {
        e.preventDefault();
        go(href);
      }}
      {...rest}
    />
  );
}

/** Dims and locks the stale content while a `go()` navigation is loading. */
export function PendingArea({ children }: { children: React.ReactNode }) {
  const { pending } = usePendingNav();
  return (
    <div aria-busy={pending} className={`transition-opacity ${pending ? "pointer-events-none opacity-40" : ""}`}>
      {children}
    </div>
  );
}
