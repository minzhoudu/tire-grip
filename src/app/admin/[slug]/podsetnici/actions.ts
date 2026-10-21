"use server";

/**
 * Owner-only actions for seasonal reminder campaigns. Each re-checks
 * requireOwnerAccess(slug) — the shop comes from the URL.
 */
import { z } from "zod";
import { getDb } from "@/db";
import { season as seasonEnum } from "@/db/schema";
import { requireOwnerAccess } from "@/server/session";
import { createCampaign, generateQueue, markSent, previewAudience, type CampaignInput } from "@/server/reminders";

const slugSchema = z.string().min(1).max(80);

const campaignInput = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "Unesite naziv kampanje").max(60),
  season: z.enum(seasonEnum.enumValues),
  messageTemplate: z.string().trim().min(1, "Unesite tekst poruke").max(500),
  dailyLimit: z.number().int().min(1).max(500).nullable(),
});

export type CampaignResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCampaignAction(raw: z.input<typeof campaignInput>): Promise<CampaignResult> {
  const input = campaignInput.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Proverite unete podatke." };
  const { shop } = await requireOwnerAccess(input.data.slug);
  const id = await createCampaign(getDb(), shop.id, {
    name: input.data.name,
    season: input.data.season,
    messageTemplate: input.data.messageTemplate,
    dailyLimit: input.data.dailyLimit,
  } satisfies CampaignInput);
  return { ok: true, id };
}

export async function previewAudienceAction(raw: { slug: string }): Promise<{ count: number }> {
  const input = z.object({ slug: slugSchema }).safeParse(raw);
  if (!input.success) return { count: 0 };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return { count: await previewAudience(getDb(), shop.id) };
}

export type GenerateQueueActionResult = { ok: true; created: number } | { ok: false; error: string };

export async function generateQueueAction(raw: { slug: string; campaignId: string }): Promise<GenerateQueueActionResult> {
  const input = z.object({ slug: slugSchema, campaignId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const { shop } = await requireOwnerAccess(input.data.slug);
  const result = await generateQueue(getDb(), shop.id, input.data.campaignId);
  return result.ok ? { ok: true, created: result.created } : { ok: false, error: "Kampanja nije pronađena." };
}

export async function markSentAction(raw: { slug: string; campaignId: string; messageId: string }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, campaignId: z.uuid(), messageId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return { ok: await markSent(getDb(), shop.id, input.data.campaignId, input.data.messageId) };
}
