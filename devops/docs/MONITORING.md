# Monitoring & Alerting Plan

Four layers, because four different things break: the app on the phone, the panel in the browser,
the backend, and the bill.

## 1. Mobile app health

| Signal | Tool | Alert threshold | Action |
|---|---|---|---|
| Crash-free sessions | Firebase Crashlytics | < 99.5% over 1h | Freeze releases, open P1 |
| Fatal + non-fatal errors | Crashlytics (release builds only) | any new issue in top 5 by volume | Triage within 24h |
| App start time | Firebase Performance Monitoring | p95 > 3s on cold start | Profile camera screen init |
| Camera capture → upload success | Custom Analytics funnel (`photo_captured` → `photo_uploaded`) | success < 97% | Check Storage rules + quota errors |
| AI filter latency / failure | Custom event `filter_applied` with duration + status | p95 > 20s or failure > 3% | Check Replicate quota, Function timeout |
| OTA update adoption | EAS Update insights | < 90% within 72h | Investigate runtime version mismatch |

Analytics events already defined in the app (`photo_captured`, `filter_purchased`,
`event_booked`, `photo_shared`, `premium_upgrade`) feed these funnels — do not add a second
analytics SDK.

## 2. Admin panel

- Google Analytics 4 + a `/healthz` static page pinged by an uptime check every 5 minutes.
- JS error tracking via Sentry browser SDK (source maps uploaded by CI; never upload maps for
  staging to the production project).
- Auth anomaly: alert when > 5 failed admin logins from one IP in 10 minutes.

## 3. Backend

| Signal | Source | Threshold |
|---|---|---|
| Function error rate | Cloud Logging / Error Reporting | > 1% of invocations over 15 min |
| Function latency | Cloud Monitoring | p95 > 3s (excluding AI calls) |
| Function cold starts / instances | Cloud Functions metrics | instances at limit for 10 min |
| Firestore reads/writes | Usage dashboard + budget alert | > 70% of expected monthly quota |
| **Rules denials** | Firestore `PERMISSION_DENIED` logs | spike > 50/min — usually a bad client release |
| Storage egress / bytes stored | Cloud Storage usage | > 70% of budget |
| Auth MAU | Firebase Auth metrics | > 80% of the free tier |

Log-based metrics + alert policies are the practical way to get all of the above; keep every
policy in the repo as JSON so it is version-controlled with the rest.

## 4. Cost & quota guardrails

- Google Cloud **budget alerts** at 50% / 80% / 100% of the monthly budget, on the billing account.
- Firebase **Blaze plan** spend caps where supported; otherwise a Cloud Function that disables
  AI-filter execution when daily spend passes a threshold (graceful degradation, not a hard crash).
- Per-user rate limits already enforced in Functions (`RATE_LIMIT_PER_MINUTE`) — watch them, because
  a hit means either abuse or a runaway client loop.

## Service level objectives (first 90 days)

| SLO | Target | Measured by |
|---|---|---|
| Crash-free sessions | ≥ 99.5% | Crashlytics |
| Photo upload success | ≥ 99% | Analytics funnel |
| Admin panel availability | ≥ 99.9% monthly | Uptime check |
| Auth API p95 latency | < 800 ms | Cloud Monitoring |
| Payment/subscription webhook success | ≥ 99.5% | Function logs |

## Dashboards to build on day one

1. **Release health** — version × crash-free × OTA adoption.
2. **Funnel** — install → signup → first photo → share → premium.
3. **Money** — subscriptions, ARPU, churn, failed payments.
4. **Ops** — function errors, rules denials, storage growth, quota burn.

## On-call basics (even solo)

- P1 = users cannot take, save or pay. Ack in 15 min, mitigation (not fix) within 1h: roll back first.
- Every alert must link to a runbook section in `ROLLBACK.md` or `RELEASE-RUNBOOK.md`.
- Post-incident: one paragraph — trigger, detection time, time-to-mitigate, one preventive action.