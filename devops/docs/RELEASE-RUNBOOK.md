# Release Runbook — step by step

## Branch & tag model

```
feature/<name> ──PR──▶ develop ──auto deploy──▶ staging
                          │
                          └──PR──▶ main ──tag vX.Y.Z──▶ production (approval gate)
hotfix/<name> ──PR──▶ main ──tag vX.Y.Z+1──▶ production, then cherry-pick back to develop
```

- `develop` is the integration branch; `main` is always releasable.
- Versioning: `MAJOR.MINOR.PATCH` — MAJOR for breaking data/native changes, MINOR for features,
  PATCH for fixes. The tag is the single source of truth; EAS `appVersionSource: remote` keeps the
  store version in step with it.

## Standard release (every 1–2 weeks)

**T-3 days — code freeze on `develop`**
1. All PR checks green (`pr-checks.yml`, `admin-preview.yml` preview link reviewed).
2. Run the QA pass from `PRODUCTION-CHECKLIST.md` § "Feature QA" on the staging build
   (internal APK / TestFlight).
3. Verify staging rules tests pass and no rules-denial spike in staging logs.

**T-2 days — staging soak**
4. Push `develop` → automatic staging deploy; confirm the staging admin panel and a staging
   mobile build both work against staging Firebase.
5. Soak 24–48h watching crash-free rate, upload success and function errors.

**T-1 day — release prep**
6. Open the release PR `develop → main`; include: changelog, migration notes, new secrets/permissions,
   and the one-way-door list (rules tightening, data migrations).
7. Confirm store metadata is ready if the native binary changed (screenshots, description, privacy
   policy URL, in-app purchase entries).

**T-0 — ship**
8. Merge to `main`, then `git tag v1.2.0 && git push origin v1.2.0`.
9. `release-production.yml` starts; the `production` GitHub Environment pauses for approval.
10. **Approver checks the release PR one last time, then approves.** Order of deployment:
    rules + indexes → functions → health check → admin panel → EAS build → store submit.
11. Android lands on the Play **internal** track first if `eas submit` was pointed at `internal`;
    promote to production at 10%, then 50%, then 100% after 24h green.
12. iOS goes to TestFlight (if submitting to `ascAppId` in draft) → phased release once approved.

**T+1h / T+24h — verify**
13. Check the release-health dashboard: crash-free ≥ 99.5%, upload success ≥ 97%,
    function error rate < 1%, no rules-denial spike.
14. Announce in the release notes channel with the tag, the store rollout state and the rollback
    plan link.

## Hotfix (out of band)

1. Branch `hotfix/x` from the tag, fix, PR straight to `main`.
2. If the fix is JS-only: `eas update --branch production --message "hotfix: <desc>"` — OTA reaches
   users in minutes, no store review.
3. If native: build + submit, then request expedited review if it is a crash or a payment blocker.
4. Tag `vX.Y.(Z+1)`, run the deploy jobs, cherry-pick to `develop`.

## Rollback

See `ROLLBACK.md`. The first action of any SEV1 is mitigation, not diagnosis.

## Optional: Fastlane fallback

EAS Submit is the primary path (it uploads the `.ipa`/`.aab` to App Store Connect and the Play
Console directly). Keep a thin Fastlane lane as a fallback if you ever need metadata-only changes:

```ruby
# fastlane/Fastfile  (fallback — primary path is `eas submit`)
default_platform(:android)

platform :android do
  desc "Upload an already-built AAB to the internal track"
  lane :internal do
    upload_to_play_store(
      track: 'internal',
      aab: '../mobile/build/app/outputs/bundle/release/app-release.aab',
      skip_upload_metadata: true
    )
  end

  desc "Promote internal to production at 10% rollout"
  lane :promote do
    upload_to_play_store(track: 'internal', track_promote_to: 'production', rollout: '0.1')
  end
end
```

Do not run Fastlane and `eas submit` on the same build — pick one lane per release.