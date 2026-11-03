# Validation — 0.3.0

Validated 2 November 2026.

| Check | Result |
| --- | --- |
| `npm test` | 21 tests passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no reported issues |
| `npx expo install --check` | Dependencies compatible with SDK 55 |
| `npm run export:all` | Web JavaScript and Android/iOS Hermes bundles generated |
| Browser workflow against exported app | Passed, including location selection |

Browser workflow: manual point selection, invalid/out-of-range coordinate rejection, requiring re-apply after editing coordinates, GPS with a simulated browser position, clear missing-search-service message, select category, review and create request, approve driver, go online, accept request, record arrival, reject wrong PIN, accept correct PIN, complete trip, save rating, switch Arabic/English, reload and recover history, verify driver goes offline after restart. Checked document overflow at viewport widths 320, 390 and 768px. Inspected the Arabic booking screen visually.

Configuration: validated Android maps plugin using a placeholder key and confirmed background location is disabled. No real key was used.

Domain tests: Arabic decimal digits, coordinate range validation, immutable coordinate snapshots, old-history compatibility, HTTPS service URL validation, returned place schema/limits, request timeout, missing-service handling, category uniqueness, draft validation, one active request, duplicate IDs, driver approval/availability, legal status transitions, reject unauthorized cancellation, correct PIN before start, cancellation restrictions, bounded one-time rating, driver suspension, persisted state validation, language changes preserving trip data.

Android APK supplement — 3 November 2026: local release build succeeded (357 Gradle tasks). Verified APK signature with Android apksigner, package/version/minSdk/ABI with aapt, ZIP integrity, embedded Hermes bundle, DEX and ARM64 native libraries. APK is signed with the template test key. Size: 27,689,730 bytes. SHA-256: `52a36b7483b2aa7ba0b5f5de8d1a34f43ff38da8ed012e1a7fd65bce710d2809`. Compatibility: ARM64, minSdk 24, version 0.2.0.

Not performed: a signed iOS IPA build, installation on a physical Android/iPhone, background location tests, real map/routing requests, native GPS/map operation on Android or iOS hardware, real phone verification, server authentication, dispatch between separate devices, live pricing, or store submission. These require the live integrations and device/build setup described in README.md.

The project contains an open local admin simulator and local trip PINs. It is a demo workflow, not production authentication or authorization.


## Modern interface — 3 November 2026

21 domain/API tests passed; TypeScript and Expo lint passed. Web/Android/iOS bundles exported. Repeated the complete browser booking workflow after the visual redesign, including AR/EN, PIN validation, coordinates, persistence and widths 320/390/768. Visually inspected Arabic home, car categories, driver, admin and the 320px English home.

Native Android release rebuilt successfully for ARM64, version 0.3.0 / versionCode 3. Confirmed the signing certificate matches 0.2.0, package identity is unchanged, APK signature verifies, and the embedded bundle/native libraries are present. Size: 28,179,646 bytes. SHA-256: `0ab9b5c9d94c23404770dfdd71fb29fd6802582d2ddde1e00c4822c630a3d756`. Physical-device installation and interaction have not been tested here.
