/**
 * Filter catalogue service.
 *
 * The filter list is a global, admin-managed catalogue: the mobile app reads it (rules allow
 * public read), only admins write it through these functions. The `prompt` field feeds the AI
 * pipeline, `isPremium` + `priceMinorUnits` drive the paywall, and `sortOrder` controls the
 * carousel order.
 */
import { db, FieldValue } from "../config/admin";
import { COLLECTIONS } from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";

const FILTERS = COLLECTIONS.filters;

export interface FilterDoc {
  filterId: string;
  slug: string;
  name: string;
  description: string;
  prompt: string;
  negativePrompt: string;
  strength: number;
  isPremium: boolean;
  priceMinorUnits: number;
  currency: string;
  category: "basic" | "artistic" | "seasonal" | "branded" | "utility";
  color: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  createdAt: FirebaseFirestore.Timestamp | unknown;
  updatedAt: unknown;
}

export async function listFilters(includeInactive = false): Promise<FilterDoc[]> {
  let query: Query = db.collection(FILTERS);
  if (!includeInactive) query = query.where("isActive", "==", true);
  const snap = await query.limit(200).get();
  const items = snap.docs.map((d) => d.data() as FilterDoc);
  return items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

export async function upsertFilter(params: {
  actorUid: string;
  filterId?: string | null;
  data: Partial<Omit<FilterDoc, "filterId" | "createdAt" | "updatedAt" | "usageCount">> & { name: string; slug: string };
}): Promise<FilterDoc> {
  const filterId = params.filterId ?? db.collection(FILTERS).doc().id;
  const ref = db.collection(FILTERS).doc(filterId);
  const existing = await ref.get();

  if (!existing.exists) {
    const slugClash = await db.collection(FILTERS).where("slug", "==", params.data.slug).limit(1).get();
    if (!slugClash.empty && slugClash.docs[0].id !== filterId) {
      throw errors.alreadyExists(`May filter na may slug na "${params.data.slug}".`);
    }
  }

  const doc = {
    filterId,
    slug: params.data.slug,
    name: params.data.name,
    description: params.data.description ?? "",
    prompt: params.data.prompt ?? "",
    negativePrompt: params.data.negativePrompt ?? "blurry, distorted, deformed, low quality",
    strength: params.data.strength ?? 0.65,
    isPremium: params.data.isPremium ?? false,
    priceMinorUnits: params.data.priceMinorUnits ?? 0,
    currency: params.data.currency ?? "PHP",
    category: params.data.category ?? "artistic",
    color: params.data.color ?? "#FF4DA6",
    isActive: params.data.isActive ?? true,
    sortOrder: params.data.sortOrder ?? 0,
    usageCount: existing.exists ? (existing.data() as FilterDoc).usageCount ?? 0 : 0,
    createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(doc, { merge: true });
  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.filterUpserted,
    targetType: "filter",
    targetId: filterId,
    after: { slug: doc.slug, isPremium: doc.isPremium, isActive: doc.isActive },
  });

  log.info({ event: "filter_upserted", filterId, actor: params.actorUid, premium: doc.isPremium });
  const saved = await ref.get();
  return saved.data() as FilterDoc;
}

export async function deleteFilter(params: { actorUid: string; filterId: string }): Promise<void> {
  const ref = db.collection(FILTERS).doc(params.filterId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang filter.");

  await ref.delete();
  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.filterDeleted,
    targetType: "filter",
    targetId: params.filterId,
    before: { slug: (snap.data() as FilterDoc).slug },
  });
  log.info({ event: "filter_deleted", filterId: params.filterId, actor: params.actorUid });
}

/** Bump a filter's popularity counter (called from finalizePhotoUpload when relevant). */
export async function incrementFilterUsage(filterId: string): Promise<void> {
  if (!filterId || filterId === "none") return;
  await db.collection(FILTERS).doc(filterId).set({ usageCount: FieldValue.increment(1) }, { merge: true }).catch(() => undefined);
}

/** Launch catalogue. Matches the mobile app's FILTER_PROMPTS map. */
export const DEFAULT_FILTERS: Array<Omit<FilterDoc, "createdAt" | "updatedAt" | "usageCount">> = [
  { filterId: "none", slug: "none", name: "Original", description: "Walang filter — orihinal na litrato.", prompt: "", negativePrompt: "", strength: 0, isPremium: false, priceMinorUnits: 0, currency: "PHP", category: "basic", color: "#B8B8D0", isActive: true, sortOrder: 0 },
  { filterId: "anime", slug: "anime", name: "Anime", description: "Anime style na may makulay na kulay.", prompt: "anime style, vibrant colors, studio ghibli inspired, highly detailed", negativePrompt: "blurry, photorealistic, low quality", strength: 0.65, isPremium: false, priceMinorUnits: 0, currency: "PHP", category: "artistic", color: "#FF4DA6", isActive: true, sortOrder: 1 },
  { filterId: "cyberpunk", slug: "cyberpunk", name: "Cyberpunk", description: "Neon futuristic na itsura.", prompt: "cyberpunk neon lights, futuristic, blade runner style, dark atmosphere", negativePrompt: "daylight, blurry, low quality", strength: 0.7, isPremium: true, priceMinorUnits: 4900, currency: "PHP", category: "artistic", color: "#00BCD4", isActive: true, sortOrder: 2 },
  { filterId: "vintage", slug: "vintage", name: "Vintage", description: "1950s retro film na kulay.", prompt: "1950s vintage photograph, sepia tones, retro film grain", negativePrompt: "modern, digital, sharp", strength: 0.5, isPremium: false, priceMinorUnits: 0, currency: "PHP", category: "basic", color: "#FFD600", isActive: true, sortOrder: 3 },
  { filterId: "oil-painting", slug: "oil-painting", name: "Oil Painting", description: "Impressionist na brush strokes.", prompt: "oil painting, impressionist style, van gogh, visible brush strokes", negativePrompt: "photo, blurry", strength: 0.75, isPremium: true, priceMinorUnits: 4900, currency: "PHP", category: "artistic", color: "#7B61FF", isActive: true, sortOrder: 4 },
  { filterId: "pop-art", slug: "pop-art", name: "Pop Art", description: "Andy Warhol style na bold colors.", prompt: "andy warhol pop art style, bold primary colors, repeated pattern", negativePrompt: "realistic, muted colors", strength: 0.8, isPremium: true, priceMinorUnits: 4900, currency: "PHP", category: "artistic", color: "#FF5252", isActive: true, sortOrder: 5 },
  { filterId: "watercolor", slug: "watercolor", name: "Watercolor", description: "Malambot na watercolor na kulay.", prompt: "watercolor painting, soft colors, artistic brushwork", negativePrompt: "photo, harsh lines", strength: 0.6, isPremium: false, priceMinorUnits: 0, currency: "PHP", category: "artistic", color: "#00E676", isActive: true, sortOrder: 6 },
  { filterId: "sketch", slug: "sketch", name: "Pencil Sketch", description: "Black and white na hand-drawn look.", prompt: "pencil sketch, black and white, hand-drawn, detailed linework", negativePrompt: "color, blurry", strength: 0.7, isPremium: false, priceMinorUnits: 0, currency: "PHP", category: "utility", color: "#B8B8D0", isActive: true, sortOrder: 7 },
  { filterId: "pixel-art", slug: "pixel-art", name: "Pixel Art", description: "8-bit retro game na itsura.", prompt: "pixel art, 8-bit style, retro game aesthetic", negativePrompt: "smooth, photorealistic", strength: 0.85, isPremium: true, priceMinorUnits: 4900, currency: "PHP", category: "artistic", color: "#FF9800", isActive: true, sortOrder: 8 },
  { filterId: "christmas", slug: "christmas", name: "Pasko", description: "Seasonal Christmas na tema.", prompt: "christmas themed photo, warm lights, festive, snow", negativePrompt: "summer, blurry", strength: 0.55, isPremium: false, priceMinorUnits: 0, currency: "PHP", category: "seasonal", color: "#00E676", isActive: true, sortOrder: 9 },
];

export async function seedFilters(force = false): Promise<number> {
  let written = 0;
  for (const filter of DEFAULT_FILTERS) {
    const ref = db.collection(FILTERS).doc(filter.filterId);
    if (!force) {
      const existing = await ref.get();
      if (existing.exists) continue;
    }
    await ref.set({ ...filter, usageCount: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    written += 1;
  }
  log.info({ event: "filters_seeded", written });
  return written;
}

import type { Query } from "firebase-admin/firestore";
