This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Approved brand identity

The owner selected logo proposal 1 on 2026-11-03: navy taxi, coral road/arrow, Arabic wordmark «يلا نروح». Use `assets/logo-approved.png` as the canonical artwork. Keep this complete logo (including the Arabic name) in all future application icons, splash artwork, website branding, and platform icon variants. App configuration points to the approved derived icons; preserve these paths when building future releases. Do not substitute the old navigation-arrow mark. Native icon changes require a new binary; an existing APK does not update automatically.

For dark website headers, use `assets/logo-header-dark.png` (ivory/coral transparent version of the same approved logo), compact 108×60 display, without a white card. Keep header branding proportional to nearby controls.

## Simple booking interface
The owner requested a map-first white interface inspired by their Yalla Go screenshots on 2026-11-04. Keep the passenger home map-first with a compact approved logo, menu and destination search. Give saved addresses and past rides their own screens. Show car categories in booking options. Derive the dispatch region from the confirmed pickup coordinates without showing a region picker to passengers. Drivers choose their work region during registration. Keep driver and admin screens in the menu. Avoid gradients, large promotional cards and persistent bottom navigation. Use the approved navy/coral logo for the white interface.

## Low connectivity (0.5.0)
Data saver defaults on. As requested on 2026-11-04, maps now mount automatically when connected, with passive network quality adaptation. Preserve already mounted maps through outages and use a lighter profile when data saver is on. Respect saved drafts and prior storage migrations. Keep cash as the only connected payment method. GPS is opt-in, foreground only, 10 seconds / 20 metres; never bridge a recording gap into a billable distance. Keep local fare snapshots immutable after ride start. Theme can be system/light/dark. SMS is a manual composer with no delivery/booking confirmation; local alerts only reflect events known to this device. There is no production booking/sync backend. Read docs/LOW_CONNECTIVITY.md before adding transport or payment behavior. Do not bulk-prefetch OSM tiles.

## One application
The owner requested one APK containing both passenger and driver modes. Publish one unified ARM64 + ARM32 APK and one website download button. Keep passenger/driver mode choices clearly visible together in the menu. Do not publish separate architecture or role downloads.

## Google Maps and permissions (0.6.0)
The owner chose Google Maps when its initial use can be free. Use official Maps URLs for free external navigation now. Native Google Maps SDK is selected only when the restricted Android key is configured at build time. When unavailable retain manual addresses and a clear Google error; the owner subsequently required Google-only parity, so never fall back to OSM. Do not use a public OSRM routing fallback. Google Routes estimates require the configured project backend and billing/quota setup. Never put a Routes server key in the client or cache Google route content on disk. Draw Google route content only on Google maps; otherwise show attributed text and the Google Maps navigation link. Ask for foreground permission via a user-initiated explanation; never assume installation grants it. Keep denial/manual entry usable. Do not bill the driver's journey to pickup.

## Google Maps parity (0.6.3)
The owner requires the same Google Maps provider and shared booking interface on web and Android. Do not switch to OpenStreetMap on slow connections or missing keys. Web uses Maps JavaScript API with a separate website-restricted public key from GOOGLE_MAPS_WEB_API_KEY in Actions (EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY in the web bundle). Android retains its package/SHA-1 restricted SDK key. If Google is unavailable keep manual entry and an honest error. Google controls its own tile delivery; passive connectivity hints reduce optional details without claiming a measured download speed.

## Website-backed Android (0.8.0)
The owner explicitly chose the Sooq Daraya model: the Android home screen must load the live HTTPS website in a WebView. Do not add Expo Update, EXPO_TOKEN, an Expo account dependency or a separate OTA publishing system. The existing Expo toolchain remains only the build framework; it is not a user account/service requirement.

Edit `src/app/index.web.tsx` and `_layout.web.tsx` for website UI. `index.tsx` is the installed wrapper entry and `_layout.tsx` is the native host. Ordinary website changes are deployed by the web workflow and appear at a fresh app open or safe Refresh page; do not bump APK version/versionCode for those changes. Build a new APK only for wrapper/native inputs, permissions, dependencies, icons or app config.

Keep the top-level WebView restricted to the exact site origin/project path. Preserve HTTPS, foreground geolocation, local notifications, external navigation and hardware back. Use the narrow typed bridge only; never execute arbitrary messages. Bootstrap migration must not overwrite existing website storage. Never force a page refresh during a ride, unfinished draft, failed save or non-home edit screen. Pass native app visibility to the website so foreground GPS pauses in the background. Native JS can still require a new APK because the installed wrapper is bundled.

Read docs/WEBSITE_APP.md for delivery and physical-device acceptance. Do not promise full offline page loading; cache reuse and locally saved data are retained, but a fresh website document needs a connection.

## Rebuilt account and booking flow (0.9.0)
The primary website is now a single server-backed beta booking flow. Keep a visible Sign in / My account action in the home header and navigation. `/account` owns sign-in, signup, password recovery and logout using the pinned official Supabase client in `auth-client.ts`; `AuthProvider` keeps a persistent, refreshed session. Never store passwords or log auth tokens. REST calls resolve the current refreshed token and reject stale requests from a previous account.

After selecting a destination, the passenger chooses a pickup using the current phone position, address search, a saved address, or the map. `/review` calculates the Google route and shared-tariff estimate using the confirmed pickup. For current-location pickup it refreshes the quote after a material position change. A manual pickup stays fixed through quote and submission. `/cloud` is My rides / Driver mode, not a separate experimental login screen. Do not restore local fake bookings as the main flow. `/admin` must require both a signed-in session and server-verified admin access. Rates are shared database settings and driver approvals use the protected RPC. Never reintroduce public demo-admin controls or client-only email authorization.

Native GPS requests share bounded jobs through `position-jobs.ts`; include that input in Android workflow filters. Native back first closes web modals, then dispatches a default event for the web router before exiting. The native loading cover ends on the website readiness status instead of waiting for every map asset, with a bounded navigation deadline. Site refresh safety includes known server ride state and unfinished drafts; an automatic current-position-only draft must not permanently disable refresh.


## Keep cached website documents usable
Do not delete earlier hashed web bundles during publication. The Pages workflow retains published files and restores recent asset history with `scripts/retain-web-assets.cjs`; current HTML must always win. Keep `startup-recovery.html` as a bounded startup/retry fallback and do not block web rendering on font downloads. This prevents old cached HTML from becoming a blank WebView after updates.


## Isolated Android host (0.9.1)
Do not restore native AppProvider/AuthProvider/storage gates to the Android root. Website state owns account, settings and drafts. SiteShell owns only WebView and bounded foreground native capabilities. GPS starts with high accuracy via foreground-fix.ts and shares jobs; keep both files in Android workflow filters. Never leave subscriptions running after success, deadline or backgrounding. Settings diagnostics must distinguish permission, approximate grant and provider/service failures.

## Admin rules guide

The admin guide is a versioned explanation of production behavior. Its first revision is seeded by `backend/admin-rules-guide.sql`. When changing booking, pricing, eligibility, offer expiry, trip stages, GPS sharing, or retry behavior, publish an updated guide revision as part of the same release. Base it on the latest revision so edits made by the owner in Admin are preserved. Use the revision lock and record a concise Arabic change summary. Keep previously published revisions readable. UI copy changes that leave the rules the same do not require a guide revision.
