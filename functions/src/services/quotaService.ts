/**
 * Quota / credits service — the money-adjacent core of the app.
 *
 * Guarantees:
 *  1. ATOMIC. Credits are debited inside a Firestore transaction that re-reads the balance
 *     before writing, so two concurrent captures can never overdraw an account.
 *  2. AUDITABLE. Every movement appends an immutable `quotaLedger` row.
 *  3. DETERMINISTIC PERIODS. Monthly allowances reset on the Asia/Manila calendar month,
 *     and the free-tier daily cap resets on the Asia/Manila calendar day. Both resets happen
 *     lazily on read *and* in a scheduled job, so a timezone bug can never strand a user.
 *  4. IDEMPOTENT. `spend()` accepts an idempotency key; a retried upload is charged once.
 */
import { db, FieldValue, Timestamp } from "../config/admin";
import { COLLECTIONS, CREDIT_COSTS, LIMITS, PLANS, type CreditAction, type PlanId } from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { dayKey, monthKey, nextMonthStart, endOfDay, startOfDay } from "../lib/dates";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import type { QuotaDoc, QuotaLedgerEntry } from "../models/types";
import { getCreditCosts } from "./configService";

const QUOTAS = COLLECTIONS.quotas;
const LEDGER = COLLECTIONS.quotaLedger;

export function quotaRef(uid: string) {
  return db.collection(QUOTAS).doc(uid);
}

async function writeLedger(entry: Omit<QuotaLedgerEntry, "createdAt" | "monthKey" | "dayKey"> & { monthKey?: string; dayKey?: string }): Promise<void> {
  const now = new Date();
  await db.collection(LEDGER).add({
    ...entry,
    monthKey: entry.monthKey ?? monthKey(now),
    dayKey: entry.dayKey ?? dayKey(now),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Create (or repair) the quota document for a user. Idempotent. */
export async function initQuota(
  uid: string,
  plan: PlanId = "free",
  opts: { credits?: number; reason?: string } = {}
): Promise<QuotaDoc> {
  const planConfig = PLANS[plan];
  const now = new Date();
  const granted = opts.credits ?? planConfig.monthlyCredits;

  const doc: QuotaDoc = {
    uid,
    plan,
    creditsRemaining: granted,
    creditsGranted: granted,
    creditsSpent: 0,
    dailyCount: 0,
    dailyLimit: planConfig.maxPhotosPerDay,
    dayKey: dayKey(now),
    monthKey: monthKey(now),
    periodStart: Timestamp.fromDate(startOfDay(now)),
    periodEnd: Timestamp.fromDate(nextMonthStart(now)),
    lastResetAt: Timestamp.fromDate(startOfDay(now)),
    updatedAt: Timestamp.now(),
  };

  await quotaRef(uid).set(doc, { merge: false });

  await writeLedger({
    uid,
    delta: granted,
    balanceAfter: granted,
    action: opts.reason ?? "init",
    reason: `Initial allocation for ${plan} plan`,
    refType: opts.reason === "signup_bonus" ? "signup" : "reset",
    refId: null,
  });

  log.info({ event: "quota_initialised", uid, plan, credits: granted, reason: opts.reason ?? "init" });
  return doc;
}

/** Ensure a quota document exists; repair one that is missing or belongs to a stale period. */
export async function ensureQuota(uid: string, plan: PlanId = "free"): Promise<QuotaDoc> {
  const snap = await quotaRef(uid).get();
  if (!snap.exists) return initQuota(uid, plan);
  const data = snap.data() as QuotaDoc;
  return rolloverIfNeeded(uid, data, plan);
}

/**
 * Lazily apply month/day rollovers. Returns the (possibly updated) quota.
 * Only a small, deterministic patch is written so concurrent readers cannot clobber counters.
 */
export async function rolloverIfNeeded(uid: string, quota: QuotaDoc, plan?: PlanId): Promise<QuotaDoc> {
  const effectivePlan: PlanId = plan ?? quota.plan ?? "free";
  const planConfig = PLANS[effectivePlan];
  const now = new Date();
  const currentMonth = monthKey(now);
  const currentDay = dayKey(now);

  const monthChanged = quota.monthKey !== currentMonth;
  const dayChanged = quota.dayKey !== currentDay;
  const planChanged = quota.plan !== effectivePlan;

  if (!monthChanged && !dayChanged && !planChanged) return quota;

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (monthChanged) {
    patch.monthKey = currentMonth;
    patch.creditsGranted = planConfig.monthlyCredits;
    patch.creditsSpent = 0;
    patch.creditsRemaining = planConfig.monthlyCredits;
    patch.periodStart = Timestamp.fromDate(startOfDay(now));
    patch.periodEnd = Timestamp.fromDate(nextMonthStart(now));
    patch.lastResetAt = FieldValue.serverTimestamp();
  }

  if (dayChanged || monthChanged) {
    patch.dayKey = currentDay;
    patch.dailyCount = 0;
  }

  if (planChanged) {
    patch.plan = effectivePlan;
    patch.dailyLimit = planConfig.maxPhotosPerDay;
  }

  await quotaRef(uid).set(patch, { merge: true });

  const next: QuotaDoc = {
    ...quota,
    ...(patch as Partial<QuotaDoc>),
    dayKey: (patch.dayKey as string) ?? quota.dayKey,
    monthKey: (patch.monthKey as string) ?? quota.monthKey,
  };

  if (monthChanged) {
    await writeLedger({
      uid,
      delta: planConfig.monthlyCredits,
      balanceAfter: planConfig.monthlyCredits,
      action: "monthly_reset",
      reason: `Monthly allowance for ${currentMonth} (${effectivePlan})`,
      refType: "reset",
      refId: null,
      monthKey: currentMonth,
      dayKey: currentDay,
    });
  }

  log.info({ event: "quota_rollover", uid, monthChanged, dayChanged, planChanged, plan: effectivePlan });
  return next;
}

export interface SpendInput {
  uid: string;
  amount: number;
  action: CreditAction | string;
  reason?: string;
  refType?: QuotaLedgerEntry["refType"];
  refId?: string | null;
  /** Idempotency key — the same key never charges twice. */
  idempotencyKey?: string | null;
  /** Skip the monthly balance check (used when the plan grants unlimited credits). */
  ignoreBalance?: boolean;
}

export interface SpendResult {
  spent: number;
  creditsRemaining: number;
  dailyCount: number;
  dailyLimit: number;
  replayed: boolean;
}

/**
 * Atomically debit credits. Throws `resource-exhausted` when the balance or the daily cap
 * would be exceeded, and `aborted` on a detected concurrent modification (client may retry).
 */
export async function spend(input: SpendInput): Promise<SpendResult> {
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw errors.invalidArgument("amount must be a non-negative integer");
  }

  const ledgerRef = input.idempotencyKey
    ? db.collection(LEDGER).doc(`${input.uid}_${input.action}_${input.idempotencyKey}`)
    : null;

  const result = await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quotaRef(input.uid));
    if (!quotaSnap.exists) {
      throw errors.failedPrecondition("Walang quota record. Mag-restart ng app para ma-initialise ito.");
    }

    // Read the ledger guard inside the transaction so a concurrent duplicate cannot slip past.
    if (ledgerRef) {
      const ledgerSnap = await tx.get(ledgerRef);
      if (ledgerSnap.exists) {
        const data = ledgerSnap.data() as QuotaLedgerEntry & { idempotencyKey?: string };
        const quota = quotaSnap.data() as QuotaDoc;
        return {
          spent: data.delta < 0 ? Math.abs(data.delta) : 0,
          creditsRemaining: quota.creditsRemaining,
          dailyCount: quota.dailyCount,
          dailyLimit: quota.dailyLimit,
          replayed: true,
        } satisfies SpendResult;
      }
    }

    const quota = quotaSnap.data() as QuotaDoc;
    const planConfig = PLANS[quota.plan ?? "free"] ?? PLANS.free;
    const now = new Date();
    const currentMonth = monthKey(now);
    const currentDay = dayKey(now);

    // Inline rollover so a month/day boundary mid-transaction is handled correctly.
    let creditsRemaining = quota.creditsRemaining;
    let dailyCount = quota.dailyCount;
    if (quota.monthKey !== currentMonth) {
      creditsRemaining = planConfig.monthlyCredits;
      dailyCount = 0;
    }
    if (quota.dayKey !== currentDay) {
      dailyCount = 0;
    }

    if (!input.ignoreBalance && creditsRemaining < input.amount) {
      throw errors.quotaExhausted(
        `Kulang ang credits (kailangan ${input.amount}, meron ${creditsRemaining}). Mag-upgrade sa premium.`
      );
    }

    // The daily cap applies to captures only, not to exports/admin grants.
    const countsTowardDaily = input.action === "photo_capture" || input.action === "burst_capture" || input.action === "gif_capture";
    if (countsTowardDaily) {
      const limit = planConfig.maxPhotosPerDay;
      if (dailyCount + 1 > limit) {
        throw errors.quotaExhausted(
          `Naabot na ang daily limit (${limit}) para sa ${planConfig.label} plan. Bumalik bukas o mag-upgrade.`
        );
      }
    }

    const nextRemaining = input.ignoreBalance ? creditsRemaining : creditsRemaining - input.amount;
    const nextDaily = countsTowardDaily ? dailyCount + 1 : dailyCount;
    const nextSpent = input.ignoreBalance ? quota.creditsSpent : quota.creditsSpent + input.amount;

    tx.set(
      quotaRef(input.uid),
      {
        plan: quota.plan,
        creditsRemaining: nextRemaining,
        creditsSpent: nextSpent,
        dailyCount: nextDaily,
        dailyLimit: planConfig.maxPhotosPerDay,
        dayKey: currentDay,
        monthKey: currentMonth,
        periodStart: quota.monthKey !== currentMonth ? Timestamp.fromDate(startOfDay(now)) : quota.periodStart,
        periodEnd: quota.monthKey !== currentMonth ? Timestamp.fromDate(nextMonthStart(now)) : quota.periodEnd,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const ledgerPayload = {
      uid: input.uid,
      delta: input.ignoreBalance ? 0 : -input.amount,
      balanceAfter: nextRemaining,
      action: input.action,
      reason: input.reason ?? `${input.action} (${input.amount} credit${input.amount === 1 ? "" : "s"})`,
      refType: input.refType ?? "photo",
      refId: input.refId ?? null,
      monthKey: currentMonth,
      dayKey: currentDay,
      createdAt: FieldValue.serverTimestamp(),
    };

    if (ledgerRef) {
      tx.set(ledgerRef, { ...ledgerPayload, idempotencyKey: input.idempotencyKey ?? null });
    } else {
      tx.set(db.collection(LEDGER).doc(), ledgerPayload);
    }

    return {
      spent: input.ignoreBalance ? 0 : input.amount,
      creditsRemaining: nextRemaining,
      dailyCount: nextDaily,
      dailyLimit: planConfig.maxPhotosPerDay,
      replayed: false,
    } satisfies SpendResult;
  });

  if (!result.replayed && result.spent > 0) {
    log.info({ event: "credits_spent", uid: input.uid, action: input.action, amount: result.spent, balance: result.creditsRemaining });
    await db.collection(COLLECTIONS.users).doc(input.uid).set(
      { counters: { lifetimeCreditsSpent: FieldValue.increment(result.spent) }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  return result;
}

/** Refund a spend (failed upload, deleted photo, admin goodwill). */
export async function refund(input: {
  uid: string;
  amount: number;
  action: string;
  reason: string;
  refType?: QuotaLedgerEntry["refType"];
  refId?: string | null;
}): Promise<{ creditsRemaining: number }> {
  const remaining = await db.runTransaction(async (tx) => {
    const snap = await tx.get(quotaRef(input.uid));
    if (!snap.exists) throw errors.notFound("Walang quota record para sa user.");
    const quota = snap.data() as QuotaDoc;
    const next = quota.creditsRemaining + input.amount;

    tx.set(
      quotaRef(input.uid),
      {
        creditsRemaining: next,
        creditsSpent: Math.max(quota.creditsSpent - input.amount, 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(db.collection(LEDGER).doc(), {
      uid: input.uid,
      delta: input.amount,
      balanceAfter: next,
      action: input.action,
      reason: input.reason,
      refType: input.refType ?? "admin",
      refId: input.refId ?? null,
      monthKey: monthKey(),
      dayKey: dayKey(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return next;
  });

  log.info({ event: "credits_refunded", uid: input.uid, amount: input.amount, balance: remaining, reason: input.reason });
  return { creditsRemaining: remaining };
}

/** Add credits (purchase fulfilment, admin grant, referral bonus, promo). */
export async function grantCredits(
  uid: string,
  amount: number,
  opts: { action: string; reason: string; refType?: QuotaLedgerEntry["refType"]; refId?: string | null }
): Promise<{ creditsRemaining: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw errors.invalidArgument("amount must be a positive integer");

  const remaining = await db.runTransaction(async (tx) => {
    const snap = await tx.get(quotaRef(uid));
    const quota = snap.exists ? (snap.data() as QuotaDoc) : null;
    const base = quota?.creditsRemaining ?? 0;
    const next = base + amount;

    tx.set(
      quotaRef(uid),
      {
        uid,
        creditsRemaining: next,
        creditsGranted: (quota?.creditsGranted ?? 0) + amount,
        plan: quota?.plan ?? "free",
        dayKey: quota?.dayKey ?? dayKey(),
        monthKey: quota?.monthKey ?? monthKey(),
        dailyCount: quota?.dailyCount ?? 0,
        dailyLimit: quota?.dailyLimit ?? PLANS.free.maxPhotosPerDay,
        periodStart: quota?.periodStart ?? Timestamp.fromDate(startOfDay()),
        periodEnd: quota?.periodEnd ?? Timestamp.fromDate(nextMonthStart()),
        lastResetAt: quota?.lastResetAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(db.collection(LEDGER).doc(), {
      uid,
      delta: amount,
      balanceAfter: next,
      action: opts.action,
      reason: opts.reason,
      refType: opts.refType ?? "admin",
      refId: opts.refId ?? null,
      monthKey: monthKey(),
      dayKey: dayKey(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return next;
  });

  await writeAudit({
    actorUid: null,
    action: AUDIT_ACTIONS.userCreditsGranted,
    targetType: "quota",
    targetId: uid,
    after: { delta: amount, balance: remaining },
    reason: opts.reason,
  });

  log.info({ event: "credits_granted", uid, amount, balance: remaining, action: opts.action });
  return { creditsRemaining: remaining };
}

/** Admin-set plan. Quota is re-initialised to the new plan's allowance immediately. */
export async function setPlan(params: {
  uid: string;
  plan: PlanId;
  actorUid: string;
  reason?: string | null;
  premiumUntil?: Date | null;
  resetCredits?: boolean;
}): Promise<QuotaDoc> {
  const planConfig = PLANS[params.plan];
  const now = new Date();
  const reset = params.resetCredits !== false;

  const quota = await db.runTransaction(async (tx) => {
    const snap = await tx.get(quotaRef(params.uid));
    const existing = snap.exists ? (snap.data() as QuotaDoc) : null;

    const next: QuotaDoc = {
      uid: params.uid,
      plan: params.plan,
      creditsRemaining: reset ? planConfig.monthlyCredits : existing?.creditsRemaining ?? planConfig.monthlyCredits,
      creditsGranted: reset ? planConfig.monthlyCredits : existing?.creditsGranted ?? planConfig.monthlyCredits,
      creditsSpent: existing?.creditsSpent ?? 0,
      dailyCount: existing?.dailyCount ?? 0,
      dailyLimit: planConfig.maxPhotosPerDay,
      dayKey: existing?.dayKey ?? dayKey(now),
      monthKey: existing?.monthKey ?? monthKey(now),
      periodStart: existing?.periodStart ?? Timestamp.fromDate(startOfDay(now)),
      periodEnd: existing?.periodEnd ?? Timestamp.fromDate(nextMonthStart(now)),
      lastResetAt: reset ? FieldValue.serverTimestamp() as unknown as Timestamp : existing?.lastResetAt ?? Timestamp.fromDate(startOfDay(now)),
      updatedAt: Timestamp.now(),
    };

    tx.set(quotaRef(params.uid), next, { merge: true });
    tx.set(
      db.collection(COLLECTIONS.users).doc(params.uid),
      {
        plan: params.plan,
        planSource: "admin_grant",
        premiumSince: params.plan === "free" ? null : FieldValue.serverTimestamp(),
        premiumUntil: params.premiumUntil ? Timestamp.fromDate(params.premiumUntil) : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return next;
  });

  if (reset) {
    await writeLedger({
      uid: params.uid,
      delta: planConfig.monthlyCredits,
      balanceAfter: quota.creditsRemaining,
      action: "admin_plan_change",
      reason: `Plan set to ${params.plan} by admin`,
      refType: "admin",
      refId: params.actorUid,
    });
  }

  const { syncClaims } = await import("./userService");
  await syncClaims(params.uid).catch((error) =>
    log.warn({ event: "claims_sync_failed_after_plan_change", uid: params.uid, error: String(error) })
  );

  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.userPlanChanged,
    targetType: "user",
    targetId: params.uid,
    after: { plan: params.plan, creditsRemaining: quota.creditsRemaining },
    reason: params.reason ?? null,
  });

  log.info({ event: "plan_changed", uid: params.uid, plan: params.plan, actor: params.actorUid });
  return quota;
}

export async function getQuotaSummary(uid: string, plan: PlanId = "free"): Promise<{
  creditsRemaining: number;
  creditsGranted: number;
  creditsSpent: number;
  dailyCount: number;
  dailyLimit: number;
  dayKey: string;
  monthKey: string;
  periodEnd: string;
  plan: PlanId;
  imagesRemainingToday: number;
}> {
  const quota = await ensureQuota(uid, plan);
  return {
    creditsRemaining: quota.creditsRemaining,
    creditsGranted: quota.creditsGranted,
    creditsSpent: quota.creditsSpent,
    dailyCount: quota.dailyCount,
    dailyLimit: quota.dailyLimit,
    dayKey: quota.dayKey,
    monthKey: quota.monthKey,
    periodEnd: quota.periodEnd.toDate().toISOString(),
    plan: quota.plan,
    imagesRemainingToday: Math.max(quota.dailyLimit - quota.dailyCount, 0),
  };
}

/** Recent ledger rows for the in-app "credit history" screen. */
export async function getLedger(uid: string, limit: number = LIMITS.defaultPageSize): Promise<QuotaLedgerEntry[]> {
  const snap = await db
    .collection(LEDGER)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, LIMITS.maxPageSize))
    .get();
  return snap.docs.map((d) => d.data() as QuotaLedgerEntry);
}

/** Cost lookup so the client can show "this will cost N credits" before capturing. */
export async function getCreditCost(action: CreditAction): Promise<number> {
  const costs = await getCreditCosts();
  return costs[action] ?? CREDIT_COSTS[action] ?? 0;
}

export { endOfDay };
