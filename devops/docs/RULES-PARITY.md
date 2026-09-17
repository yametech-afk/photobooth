# 🧭 Rules Parity — Decision Record (v4)

**Status:** bukas na desisyon (owned by Backend, hindi DevOps) · **Nakaapekto:** audit W9 (HIGH)

## Ang problema

Tatlong magkaibang kopya ng Firestore/Storage rules ang nasa repo:

| # | Landas | Laki | Admin model | Sino nagde-deploy |
|---|---|---|---|---|
| 1 | `firestore.rules` (root) | ~223 linya, pinakamalawak ang collection coverage | `adminRoles/{uid}` **+** custom claim `admin: true` | Root `firebase.json` → lahat ng workflow |
| 2 | `devops/firestore.rules` | mas maikli, custom-claim hardened | `adminRoles/{uid}` + claim | wala (reference tree) |
| 3 | `admin-panel/firestore.rules` | hiwalay, lumang model | `admins/{uid}` | wala (nasa loob ng panel zip) |

Ang CI ay nagde-deploy ng **root** copy lang — ang `firebase.json` ng root ay
`"rules": "firestore.rules"`. Ang peligro ay hindi ang deploy, kundi ang
pagkalito: may nag-edit ng `devops/firestore.rules` o `admin-panel/firestore.rules`
at inaasahan na iyon ang live.

## Ang desisyon ng DevOps (dito lang, hindi para sa backend)

Ang DevOps pack ay **hindi** nagbabago ng rules content. Ang ginawa lang:

1. **Isang deployment path lang** — ang root `firestore.rules` at
   `storage.rules`. Ito ang aktwal na binabasa ng `pr-checks.yml` rules tests
   (`functions/test/rules/*.test.ts` → `readFileSync(REPO_ROOT + '/firestore.rules')`),
   kaya **ang na-test ay ang na-deploy**. Ito ang Gate 3 requirement:
   *"Rules parity decision tapos na at ang na-deploy ay ang na-test."*
2. **Ang `devops/firestore.rules` at `devops/storage.rules` ay nananatiling
   reference copy** sa loob ng devops pack. Kung iisa lang ang kailangan,
   tingnan ang rekomendasyon sa ibaba.
3. Ang `devops/firebase.json` ay nananatiling reference (may sariling
   `codebase: default`, emulator `pubsub` port, at `deploy --only` na layout).
   Ang **root `firebase.json` ang canonical** (`codebase: photobooth-core`,
   hosting `target: admin`).

## Rekomendasyon para sa backend owner

- **Piliin ang root** bilang tanging canonical rules file.
- Kung kailangan pa ng reference ang devops copy, palitan ng **header reminder**:

  ```
  // ⚠️ REFERENCE ONLY — DO NOT DEPLOY.
  // The canonical rules live at /firestore.rules (repo root) and are the only
  // ones loaded by CI rules tests and by `firebase deploy`.
  ```
- Alisin ang admin model na `admins/{uid}` mula sa `admin-panel/**` at gawing
  `custom claim + adminRoles/{uid}` (audit W4/W12) — nasa admin-panel at backend
  ownership ito, hindi DevOps.
- Alisin na ang `admin-panel/firestore.rules` / `admin-panel/storage.rules` kapag
  wala nang tumutukoy dito, para isa lang ang rules file sa buong repo.

## Ano ang hindi DevOps na desisyon

Ang **nilalaman** ng rules (whitelist ng client-writable fields, admin
requirement, quotas/subscriptions write deny) ay hindi binabago ng patch na ito.
Ang DevOps contribution ay ang **isang path ng katotohanan** at ang pag-test
nito sa CI.
