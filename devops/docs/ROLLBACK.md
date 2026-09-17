# Rollback Strategy

Golden rule: **mitigate before you diagnose.** Every surface below can be reverted without a new
store review except the native binary, so ship the JS/config fix first and diagnose afterwards.

| # | Surface | Bad symptom | Rollback action | RTO |
|---|---|---|---|---|
| 1 | Admin panel (Hosting) | Broken dashboard after deploy | `firebase hosting:rollback --project photobooth-app-prod` (or re-run the deploy job from the previous tag) | 2 min |
| 2 | Firestore / Storage rules | Widespread `PERMISSION_DENIED` in logs | `git checkout <last-good-tag> -- firestore.rules storage.rules` then `firebase deploy --only firestore:rules,storage --project photobooth-app-prod` | 5 min |
| 3 | Cloud Functions | 5xx spike, bad payment logic | Redeploy the previous tag: `git checkout v1.1.0 && firebase deploy --only functions --project photobooth-app-prod`; or disable the single offending function in the console for an instant stop | 5–10 min |
| 4 | Indexes | Query failures after an index change | Redeploy `firestore.indexes.json` from the last good tag (indexes are additive; never delete a field override in a hotfix) | 10–30 min |
| 5 | Mobile JS (OTA) | New UI/JS bug in a shipped build | `eas update:rollback --branch production --channel production` → republish the previous update | 5 min |
| 6 | Mobile native binary | Crash only in a new store build | Halt the staged rollout (Play: *halt rollout*; App Store: pause *phased release*), ship an OTA patch if the fix is JS-only, otherwise build an expedited hotfix | 2h–48h |
| 7 | Feature-level | One AI filter or a paywall misbehaving | Flip the kill switch in Remote Config / `EXPO_PUBLIC_FLAG_*` and push an OTA update — no code change, no build | 5 min |
| 8 | Data corruption | Bad write path damaging documents | Cloud Firestore **point-in-time recovery** (restore to a timestamp) + disable the writer function immediately | 1–4h |

## Guardrails that make rollback possible at all

- **Everything is tagged.** `v1.2.0` maps to an exact commit; every deploy job can be re-run against a tag.
- **Release record.** `release-production.yml` saves the previous Hosting release list as a CI
  artifact, so you always know what to return to.
- **Runtime version pinning.** `runtimeVersion: { policy: 'appVersion' }` means an OTA update is
  only served to binaries that can execute it — no "white screen after update" class of incident.
- **Staged rollout.** Android goes out at 10% via `rollout: 0.1`, iOS via phased release; a bad
  build reaches a fraction of users before it is halted.
- **One-way doors are flagged.** Data migrations and Rules tightening are the only changes that
  cannot be trivially reverted — they are listed in the release PR and require a second pair of eyes.
- **Backups.** Daily Firestore export to a separate bucket with a 30-day retention, automated by a
  scheduled Cloud Function. Test one restore per quarter; an untested backup is not a backup.

## Rollback decision tree

1. Is the incident user-blocking? → yes: mitigate now (rows 1–5), diagnose later.
2. Is the fault in JS only? → OTA rollback (row 5). Never schedule a store release for a JS bug you
   can fix without one.
3. Is the fault native (permission, native module, SDK)? → halt rollout + hotfix (row 6).
4. Is data wrong? → stop the writer first, then restore (row 8). Restoring on top of a live writer
   corrupts data twice.

## Communication template

```
INCIDENT <id> — <service> — SEV1/2
Impact: <who / how many users>
Detected: <time, by what alert>
Mitigation: <action taken, e.g. hosting:rollback>
Status: mitigating | monitoring | resolved
Next update: <time>
Owner: <name>
```