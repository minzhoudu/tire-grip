/**
 * Runs notifyShop after the response is sent (next/server `after`), so a
 * slow push service or email never delays the customer's confirmation, and
 * a failure there can't turn a successful booking into an error.
 */
import { after } from "next/server";
import { getDb } from "../db/index.ts";
import { notifyShop, type ShopEvent } from "./notifications.ts";
import { getOrigin } from "./origin.ts";

export async function notifyShopAfterResponse(event: ShopEvent): Promise<void> {
  const origin = await getOrigin();
  after(async () => {
    try {
      await notifyShop(getDb(), event, { origin });
    } catch (err) {
      console.error(`[notify] ${event.kind} ${event.bookingId} nije poslato`, err);
    }
  });
}
