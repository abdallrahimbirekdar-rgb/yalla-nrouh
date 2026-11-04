# One website, shown inside the Android application

## Delivery
The Android entry `src/app/index.tsx` opens the live `https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/` website through `SiteShell`. Website UI remains in `index.web.tsx` with a separate web root layout. This uses the same website-view model as Sooq Daraya. It requires no Expo account, Expo Update service, project UUID or publishing token. The existing build framework and installed WebView library remain in use.

Install the 0.8.0 transition APK once. Thereafter publish ordinary UI, text, zoom and web-logic changes with the web workflow. The installed app requests a fresh HTML document on a fresh launch, while hashed assets can be cached. On return from the background it checks a small version.json and offers Refresh page if needed. The in-app menu also includes Refresh page. Refresh is allowed only from the home page with no active trip, unfinished draft or failed save.

The APK workflow runs automatically only for listed wrapper/native inputs. Updates to the website do not require changing app.json version/versionCode. A change to native permissions, native wrapper behavior, dependencies, icons or app configuration still needs an APK. Add any new native build input to the path filter, or manually dispatch the APK workflow.

## Data and native features
A narrow bridge bootstraps the native foreground permission state and, only when website local storage is empty, the previous APK's saved booking/history/preferences. Existing website data wins. Bootstrap failures show a retryable load error, never silently overwrite previous data. The website receives native app visibility to pause foreground GPS when the app goes to the background. Local notification permission and posting use the existing native module through bounded typed requests.

Only the exact HTTPS site origin and project path remain in the WebView. External directions, phone and browser links open through the OS. Javascript/file/data URLs are blocked as top-level destinations. Migration payloads are serialized as data rather than commands. The Android download banner is hidden inside the installed app. Android hardware back first closes web modals, then goes back in website history, then exits at home.

A fresh website document needs connectivity. Previously saved local data is not erased on network failure; a retry screen is shown. This is not a full offline site pack. Route and booking server limitations are unchanged.

## Physical-device acceptance
1. Upgrade the existing APK in place; check the package and signature remain compatible.
2. Verify old booking/history data imports once and subsequent website edits remain intact.
3. Grant foreground precise location; verify current-location zoom 19, manual pickup and destination, and external Google navigation.
4. Test Android back with a menu, booking sheet and non-home page. Test optional local notification permission and a known local ride change.
5. Publish a harmless website-only text change, without building another APK. Reopen the installed app or apply the safe refresh banner and verify it appears.
6. Resume during a ride/draft; confirm refresh is not forced. Test loss/recovery of internet and app background/foreground GPS gaps.

Repository checks cannot substitute for this physical-device acceptance. Do not claim these device checks passed unless actually performed.


## Startup recovery (0.8.1)
- Invalid saved JSON/schema is archived byte-for-byte under a unique `yalla-nrouh-demo-v1-recovery-*` key before creating readable settings/draft data. A failed read or backup does not overwrite anything. The app shows a recovery notice; unreadable trip records remain in the backup.
- Native bootstrap requests retry once per second. Existing website storage remains usable if the host never responds. A first migration that times out opens the map but blocks saving until the user reopens the page to retry, with a specific notice. The original SQLite store remains untouched by the web page.
- Invalid data supplied by an older native host is backed up under a `-native-recovery-*` website key before being skipped.
- Physical acceptance: install over 0.8.0, confirm startup and location; verify older malformed data no longer causes a permanent startup error. This cannot be verified on the user's phone remotely.


## Shared location picker update (2026-11-04)
- The Android wrapper continues to load the same website. This is a website-only update; no APK version bump.
- A recent position paints immediately, followed by a fresh foreground read. A returned position can also be used by the explicit pickup button even if its native event updated the camera first.
- The home map initializes an empty pickup from the current position. Home pin selection, picker confirmation and both booking submission screens check a 500-metre straight-line radius from the device position; the pin is never used as the radius centre. Final confirmation rechecks position. Without GPS, pickup confirmation is blocked with a retry message.
- Destination: tap/drag/select centre, Google Places text search, or authenticated account favourites. Search uses the existing website-restricted key and requires Places API (New) enabled and allowed by that key; failure remains explicit, with map selection available.
- Account places are user-editable Supabase Auth metadata under yalla_saved_places, capped at 20. They confer no permissions. Only the signed-in user's /auth/v1/user endpoint is used; no admin/service key. Save/delete updates are displayed only after the server echoes the expected list. The existing in-memory sign-in policy is unchanged.
- Physical acceptance still required: current-location permission and centring on Android, resume after background, denied permission/GPS off, inside/outside 500-metre pickup, Google search with the production key, account save/sign-out/sign-in and cross-device retrieval, map pin round trip and web/Android visual parity.
