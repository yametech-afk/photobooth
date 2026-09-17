# Android APK Build — GitHub Actions Setup

Workflow na **libre** at **walang kailangang bayad na EAS plan** para makabuo ng
installable na Android APK mula sa `mobile/` folder ng repo na ito.

- Workflow file: `.github/workflows/android-apk.yml`
- Trigger: manual (**Actions → Android — Build APK → Run workflow**) o bawat push sa `main` na may pagbabago sa `mobile/`
- Output: APK sa **Artifacts** ng run (nadodownload, 30 araw na retention)
- Ang existing na `mobile-eas-build.yml` ay **hindi ginalaw** — nananatili ito para sa EAS/OTA at store submission.

---

## Bakit Gradle at hindi EAS

Ang `mobile-eas-build.yml` ay umaasa sa `EXPO_TOKEN` at sa bayad na EAS build
service. Ang workflow na ito ay tumatakbo nang direkta sa GitHub-hosted runner:

```
npm install (mobile/)  →  expo prebuild --platform android  →  ./gradlew assembleRelease
```

Walang kailangang secret para makabuo ng **debug** o **default-signed release**
APK. Ang tanging babayaran ay walang — libre ang public repo runners.

---

## Mga bersyon na nakita sa aktwal na repo

| Bagay | Halaga | Pinagmulan |
|---|---|---|
| Expo SDK | `~50.0.0` | `mobile/package.json` |
| React Native | `0.73.6` | `mobile/package.json` |
| Node sa runner | `20` | tugma sa `functions/package.json` (`"node": "20"`) at `pr-checks.yml` |
| JDK | `17` | kailangan ng RN 0.73 / Android Gradle Plugin ng SDK 50 |
| `mobile/android/` | **WALA** | kumpirmado — kaya kinakailangan ang `expo prebuild` bago mag-Gradle |
| Android SDK packages | `platforms;android-34`, `build-tools;34.0.0` | default ng Expo SDK 50 prebuild |

> Ang mobile app ay isang **workspace** ng root `package.json` (`"workspaces": ["mobile", ...]`).
> Ginagamit ng workflow ang `npm_config_workspaces=false` sa loob ng `mobile/` para
> hindi mag-hoist ang `expo` sa root `node_modules` — isang kilalang sanhi ng
> "Unable to resolve module expo" sa Metro at sa Expo config resolution.

---

## Paano i-install

### Paraan A — kopyahin ang files (pinakamabilis)

Kopyahin ang mga sumusunod sa repo mo, panatilihin ang eksaktong path:

```
.github/workflows/android-apk.yml          → repo root
mobile/scripts/ci-ensure-assets.mjs        → mobile/scripts/
mobile/scripts/ci-inject-signing.mjs       → mobile/scripts/
mobile/assets/icon.png                     → mobile/assets/  (placeholder — palitan ng tunay na icon)
```

Tapos:

```bash
git add .github/workflows/android-apk.yml mobile/scripts mobile/assets
git commit -m "ci: add free Android APK build workflow (Gradle, no EAS)"
git push origin main
```

### Paraan B — patch file

```bash
cd /path/to/photobooth
git apply --binary android-apk-ci.patch
git add -A
git commit -m "ci: add free Android APK build workflow (Gradle, no EAS)"
git push origin main
```

---

## Paano patakbuhin

1. Buksan ang repo sa GitHub → tab na **Actions**.
2. Piliin sa kaliwa ang **Android — Build APK**.
3. **Run workflow** → piliin ang `release` o `debug` → **Run workflow**.
4. Hintayin ang ~10–20 minuto (unang build ang pinakamatagal dahil sa Gradle downloads).
5. Sa ilalim ng run page, hanapin ang **Artifacts** → `photobooth-android-<task>-<sha>`.
6. I-unzip at i-install ang `.apk` sa Android device (kailangan i-enable ang "Install unknown apps").

Sa `release` task, gagamitin ng Expo template ang **debug keystore** bilang
signing config kapag walang secrets — kaya **installable pa rin** ang APK, pero
**hindi ito pwedeng i-upload sa Play Store**. Para sa tunay na release signing,
tingnan ang seksyon sa ibaba.

---

## Optional: tunay na release signing (upload keystore)

Kung mayroon ka nang keystore:

```bash
# Gumawa ng bagong keystore (kung wala pa)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore -alias photobooth \
  -keyalg RSA -keysize 2048 -validity 10000

# I-base64 para sa GitHub secret
base64 -w0 release.keystore > release.keystore.b64
```

Idagdag sa **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Halaga |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | nilalaman ng `release.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `photobooth` (o ang alias mo) |
| `ANDROID_KEY_PASSWORD` | key password |

Kapag naka-set ang apat, awtomatikong ipapasok ng workflow ang keystore sa
`android/app/build.gradle` at gagamitin sa `release` signing config. Kung
naka-set ang `ANDROID_KEYSTORE_BASE64` pero kulang ang iba, **tumitigil ang
build na may malinaw na error** — sadya ito, para hindi makalabas nang tahimik
ang mali-signed na APK.

> Ang keystore ay dapat **i-back up** ng ligtas. Kapag nawala ito, hindi ka na
> makakapag-update ng app sa Play Store.

---

## Optional: konektado sa Firebase ang APK

Idagdag sa **Settings → Secrets and variables → Actions → Variables** (hindi
secrets — public by design ang mga Firebase client keys):

| Variable |
|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` |

Kapag wala ang mga ito, bubuo pa rin ang APK, ngunit hindi makakakonekta ang app
sa backend — inaasahan ang `mobile/.env` pattern ng repo (tingnan ang
`mobile/.env.example`). Ang `EXPO_PUBLIC_*` ay na-inline sa JS bundle sa build
time, kaya env vars bago ang Gradle step ang tamang paraan.

---

## Mga file na idinagdag

| File | Ginagawa |
|---|---|
| `.github/workflows/android-apk.yml` | Ang workflow mismo |
| `mobile/scripts/ci-ensure-assets.mjs` | Gumagawa ng valid na placeholder PNG para sa `app.json` assets na wala pa (kailangan bago ang `expo prebuild`). Purong Node, walang dependency. |
| `mobile/scripts/ci-inject-signing.mjs` | Nag-inject ng upload keystore sa `android/app/build.gradle` pagkatapos ng prebuild; idempotent at fail-closed. |
| `mobile/assets/icon.png` | Placeholder 1024×1024 icon. **Palitan ng tunay na branding.** |

---

## Mga limitasyon (basahin bago mag-rely)

- Ang APK na ito ay **built mula sa source sa CI**, hindi mula sa EAS. Walang
  OTA update, walang EAS credentials management, at walang automatic store
  submission — para doon, gamitin ang `mobile-eas-build.yml`.
- Ang placeholder assets ay solid-color PNG. Ang tunay na icon/splash ay kailangan
  bago ang anumang store release.
- Ang `app.json` ay may `com.yourbrand.photobooth` pa. Palitan ng tunay na
  package name bago ang Play Store upload — hindi kailangan para sa sideload testing.
- Hindi ito naisakatuparan sa tunay na GitHub runner sa setup na ito: ang mga
  script ay nasubok nang lokal (asset generator gumawa ng valid na 1024×1024 PNG;
  signing injector pumasa sa isang mock Expo `build.gradle` at idempotent sa
  pangalawang run), ngunit ang buong Gradle build ay hindi pa tumakbo dito.
  Ang unang run sa GitHub ang magiging tunay na beripikasyon.
