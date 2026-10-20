/**
 * Booking status rules for the admin panel.
 *
 *   pending ──confirm──▶ confirmed ──complete──▶ completed
 *      │                    │ ├──noShow──▶ no_show   (only once the slot has started)
 *      └──reject──▶ rejected └──cancel──▶ cancelled  (only before the slot starts)
 *
 * Final statuses never change again. The server applies a change with a
 * conditional UPDATE (… WHERE status IN from), so two people tapping at
 * once can't both succeed.
 */
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected" | "no_show";
export type BookingAction = "confirm" | "reject" | "cancel" | "complete" | "noShow";

export const ACTIONS: Record<BookingAction, { from: BookingStatus[]; to: BookingStatus; label: string }> = {
  confirm: { from: ["pending"], to: "confirmed", label: "Potvrdi" },
  reject: { from: ["pending"], to: "rejected", label: "Odbij" },
  cancel: { from: ["confirmed"], to: "cancelled", label: "Otkaži" },
  complete: { from: ["confirmed"], to: "completed", label: "Završeno" },
  noShow: { from: ["confirmed"], to: "no_show", label: "Nije došao" },
};

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Novi",
  confirmed: "Potvrđen",
  completed: "Završen",
  cancelled: "Otkazan",
  rejected: "Odbijen",
  no_show: "Nije došao",
};

export const FINAL_STATUSES: BookingStatus[] = ["completed", "cancelled", "rejected", "no_show"];

/** Actions that make sense for a booking right now, in display order. */
export function allowedActions(status: BookingStatus, startsAt: Date, now: Date): BookingAction[] {
  const started = now.getTime() >= startsAt.getTime();
  switch (status) {
    case "pending":
      return ["confirm", "reject"];
    case "confirmed":
      return started ? ["complete", "noShow"] : ["complete", "cancel"];
    default:
      return [];
  }
}

/** After this action, should the shop message the customer? */
export function notifiesCustomer(action: BookingAction): boolean {
  return action === "confirm" || action === "reject" || action === "cancel";
}
