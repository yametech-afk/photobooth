# Production Launch Checklist

Nothing is "done" until its box is ticked with evidence (a link, a screenshot, or a command output).

## A. Accounts & legal
- [ ] Google Play Console account active ($25 one-time) — app created, package name reserved
- [ ] Apple Developer Program active ($99/yr) — App ID + bundle id created in App Store Connect
- [ ] Privacy policy live at a public URL (required by both stores)
- [ ] Terms of service published; photo-consent wording covers minors/blurred faces
- [ ] Store listings ready: title, subtitle, description, keywords, screenshots (all required sizes), feature graphic
- [ ] Data-safety form filled for Play; App Privacy answers completed for Apple
- [ ] Support email + in-app support link working
- [ ] Payments: merchant/business verification completed for in-app purchase (or Stripe account verified)

## B. Firebase production project
- [ ] `photobooth-app-prod` created in `asia-southeast1`
- [ ] Auth providers enabled: Email/Password (**required**), Google, Apple (needed for iOS if Google sign-in is offered)
- [ ] Firestore in production mode; Storage bucket created
- [ ] Blaze plan enabled (Functions need it); budget alert configured at 50/80/100%
- [ ] Hosting site `photobooth-admin-prod` created and linked to target `admin`
- [ ] `firestore.rules`, `storage.rules`, `firestore.indexes.json` deployed from the release tag
- [ ] Cloud Functions deployed to `asia-southeast1`; `/health` returns 200
- [ ] All Functions secrets set (`REPLICATE_API_TOKEN`, `STRIPE_*`, `INTERNAL_API_TOKEN`)
- [ ] Firestore composite indexes built (status: *Enabled*, not *Building*)
- [ ] Daily Firestore export backup configured; **one restore tested successfully**
- [ ] Authorized domains for Auth include the admin panel's production domain

## C. Security
- [ ] `admins/{uid}` document exists for every admin; `admin: true` custom claim set on those uids
- [ ] Test: a signed-in non-admin gets `PERMISSION_DENIED` reading `/admins` and `/subscriptions`
- [ ] Rules tests pass in CI (`firebase emulators:exec --only firestore,storage,auth`)
- [ ] App Check registered (App Attest / Play Integrity / reCAPTCHA Enterprise) and **enforced** in prod
- [ ] Storage size (10 MB) + content-type (`image/*`) limits verified by an upload test
- [ ] Rate limiting live on AI filters and payments (429 returned after the configured threshold)
- [ ] Service accounts are least-privilege; no Owner keys used in CI
- [ ] Secrets rotated away from anything ever pasted into a chat, doc, or commit
- [ ] No secret in the mobile bundle or admin bundle (CI scan green)

## D. Mobile release
- [ ] `app.config.js` resolves the production bundle id and project id (verify the built manifest, not the source)
- [ ] Version + build number auto-incremented by EAS (`appVersionSource: remote`)
- [ ] Android keystore and iOS distribution certificate stored in EAS (`credentialsSource: remote`)
- [ ] `eas build --platform all --profile production` succeeds from a clean checkout
- [ ] Production binary smoke-tested on a real mid-range Android device **and** a physical iPhone
- [ ] Camera, gallery export, sharing, and premium purchase all work on the production build
- [ ] Offline / no-permission states show a usable message, not a blank screen
- [ ] Crashlytics receiving events from the production build; symbol/source maps uploaded
- [ ] `eas submit` configured with the real `ascAppId` and `appleTeamId`

## E. Admin panel release
- [ ] Login works; non-admin accounts are rejected with a clear message
- [ ] Users, Filters, Revenue, Events pages load with production data
- [ ] Same-origin/SPA rewrite works (deep link refresh does not 404)
- [ ] Security headers present (`X-Frame-Options`, HSTS, `nosniff`)
- [ ] Previous Hosting release recorded as a rollback artifact

## F. Monitoring & ops
- [ ] Crashlytics, Performance, Analytics active in prod
- [ ] Error Reporting / alerts wired to a channel a human actually reads
- [ ] Uptime check on the admin panel and `/health` function endpoint
- [ ] Log-based alert for rules denials and function error rate
- [ ] Release-health dashboard created
- [ ] Runbooks (`ROLLBACK.md`, `RELEASE-RUNBOOK.md`) reviewed by whoever is on call
- [ ] On-call contact + escalation path written down

## G. Feature QA (staging, before promotion)
- [ ] Signup → login → logout → password reset
- [ ] Photo capture (single + burst), filter apply, upload, gallery, share, delete
- [ ] Premium purchase flow incl. restore-purchases and cancellation
- [ ] Event booking create/cancel
- [ ] Admin: user plan toggle, filter CRUD, revenue figures match Firestore
- [ ] Airplane-mode behaviour, permission-denied behaviour, low-storage behaviour

## H. Launch day
- [ ] Tag created and release workflow approved
- [ ] Backend + hosting deployed and verified
- [ ] Android rollout started at 10% (not 100%)
- [ ] iOS submitted / phased release started
- [ ] Marketing assets scheduled (store feature graphic, social posts)
- [ ] Rollback row for each surface re-read and confirmed workable

## I. First 48 hours
- [ ] Crash-free ≥ 99.5%; no new top-5 crash
- [ ] Upload success ≥ 97%; AI filter failure < 3%
- [ ] No rules-denial spike; no unexpected cost curve
- [ ] Rollout raised to 50% then 100% only after the above hold for 24h
- [ ] Support tickets triaged; one paragraph written on anything that surprised you