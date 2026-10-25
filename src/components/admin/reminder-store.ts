"use client";

import { useSyncExternalStore } from "react";
import { markReminderSentAction } from "@/app/admin/[slug]/actions";

/**
 * Day-before reminders sent on this screen, shared by the "Podsetnici za sutra" card and the booking
 * cards below it, so sending from either place updates both right away.
 */
const sent = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sendReminder(slug: string, bookingId: string) {
  if (!sent.has(bookingId)) {
    sent.add(bookingId);
    version++;
    listeners.forEach((l) => l());
  }
  void markReminderSentAction({ slug, bookingId });
}

/** Re-renders when any reminder is sent; returns a checker that also respects the server's state. */
export function useSentReminders(): (bookingId: string, sentOnServer: boolean) => boolean {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return (id, sentOnServer) => sentOnServer || sent.has(id);
}
