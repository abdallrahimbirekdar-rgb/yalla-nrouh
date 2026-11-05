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
- Pickup uses only the current phone position. The home and pickup maps cannot select or drag a pickup pin. Review replaces old saved pickup points with a measured phone fix; final submission reads the phone again and sends that exact point. Moves over 30 metres trigger a new estimate before confirmation. Destination map selection, search and saved places remain available. Without GPS, booking is blocked with a retry message.
- Destination: tap/drag/select centre, Google Places text search, or authenticated account favourites. Search uses the existing website-restricted key and requires Places API (New) enabled and allowed by that key; failure remains explicit, with map selection available.
- Account places are user-editable Supabase Auth metadata under yalla_saved_places, capped at 20. They confer no permissions. Only the signed-in user's /auth/v1/user endpoint is used; no admin/service key. Save/delete updates are displayed only after the server echoes the expected list. The existing in-memory sign-in policy is unchanged.
- Physical acceptance still required: current-location permission and centring on Android, resume after background, denied permission/GPS off, current-only pickup and requoting after movement, Google search with the production key, account save/sign-out/sign-in and cross-device retrieval, map pin round trip and web/Android visual parity.

## Rebuild 0.9.0 (2026-11-05)
The home header includes a visible account action; login, signup and recovery live at `/account`. The official pinned Supabase Auth client persists and rotates the session without retaining the password. Account changes clear known ride state; stale network work cannot borrow a later account's session. The admin screen is gated by server-verified membership and uses central rates and driver approval RPCs.

The home booking flow now uses the account's server rides. `/review` calculates the route on entry after sign-in, presents a fare estimate, then requires explicit booking confirmation and a fresh pickup-radius check. Previous local-demo state is retained but no longer presented as the primary booking/driver/history service.

Android 0.9.0 / code 18 rebuilds the wrapper for shared, bounded GPS tasks, shared native permission prompts, a website-readiness loading signal, a 30-second navigation recovery deadline and router-aware hardware back. A new APK is needed for these native changes. Subsequent website interface changes keep the established live-website delivery model.

Automated checks cover persistence and refresh without password storage, rejecting stale-account requests, GPS request sharing/timeouts, pickup limits, server quotas and auth, saved places and safe refresh state. Physical Android acceptance and actual email delivery are separate checks; do not claim those passed remotely.


## Cached-document startup recovery
A cached Pages document can reference the previous hashed JavaScript bundle after a deployment. Deleting that bundle can leave only the download banner and a blank app. The web workflow now retains published files and restores the last six published asset archives before deployment, while never restoring old HTML over the new build. A regression test verifies old bundles remain available, new files win, and current HTML is preserved.

The HTML shows a bounded startup/retry message until React mounts. Web fonts load without blocking account/map rendering. No automatic page reload erases an unfinished edit; retry is a user action and stored data stays intact.


## Native GPS isolation 0.9.1 / code 19
The Android root no longer initializes the legacy native AppProvider, AuthProvider, SQLite preferences, fonts or native permission intro before opening the live website. Accounts, settings and drafts have a single website owner. The wrapper is limited to its WebView, foreground permissions, lifecycle and notifications. A new installation grants location from the website's deliberate My location action through the single Android bridge.

The previous passenger request used balanced accuracy and timed out before trying high accuracy when no first fix arrived. The replacement uses a temporary high-accuracy foreground subscription from the start, accepts only a recent measured fix (250 m for the passenger map, 50 m for metering), waits up to 20 seconds and removes the subscription on success, deadline or backgrounding, including late registration. Concurrent requests share a task. Cache is bounded to 60 seconds/250 m (30 seconds/50 m for metering). No background service is added.

A deliberate location tap may show Android's high-accuracy location-services dialog when network location is off. App permission and provider state are checked separately; approximate-only grants produce a precise-location instruction. Settings never start GPS on mount and no longer mark a timeout as a denied permission. Native provider diagnostics show app version, precise/coarse permission, satellite/network provider and services state without coordinates or account data. The typed settings action opens OS app settings.

Device acceptance remains required: upgrade in place; open Settings and change theme/back without waiting for GPS; test denied/coarse/precise permission, service-off dialog, fresh GPS indoors/outside, timeout/retry, background cancellation, return from OS settings, map centring and current-only pickup checks. Unit tests and APK compilation do not establish physical reception on the owner's phone.


## Android 1.0.2 / code 22 and approved driver interface
Map startup now starts high-accuracy foreground GPS immediately (20-second bounded subscription), rather than spending 8.5 seconds on balanced location before trying satellites. A recent measured fix (20 seconds / 250 m for the map) can display first. Explicit location taps may offer Android's network-provider settings dialog. Concurrent map consumers share a provider; cancellation removes only that consumer, and backgrounding settles pending page requests before stopping GPS. A page reload resets the native startup fallback. These host changes require APK 1.0.2.

Approved driver status is loaded from the existing RLS-protected driver_accounts record with the signed-in session. Approved drivers open the driver dashboard, with a current-location map, availability and assigned trips. Booking, passenger tabs and saved destination controls are hidden for drivers; sign-out, settings and server-verified admin access remain available. Account role loading blocks the booking UI until verification succeeds.

Regression coverage adds concurrent GPS consumer cancellation and clean retry. Physical-device acceptance remains outstanding: upgrade in place, first launch, indoor/outdoor GPS, permission/provider settings, background/resume, approved-driver login and a two-account test trip.


## Navigation startup and request latency
The website displays a recent measured device position immediately (<=10 seconds / <=250 m), without reacquiring native GPS. Map display and road preview are separated from turn guidance: only a <=50 m fix no older than 15 seconds enables current turn instructions. Driver metering keeps its original stricter native fix path. A GPS failure stops the failed attempt instead of starting another spinner every ten seconds. Location and road calculation now have separate elapsed-time labels and specific errors with a location-settings action.

When the driver position is available, request summaries use one Google computeRoutes call with pickup as an intermediate stop. The two returned legs preserve driver-to-pickup road distance/ETA and passenger-trip distance/duration/fare separately. The existing two-point API remains backward compatible. Initial pending cards use the latest measured position when queued work actually starts, and route plans pass to accepted-ride navigation in component memory. Existing daily quotas are preserved.

Tests assert zero bridge/provider calls for a valid measured startup position, map-only handling of approximate fixes, exclusion of stale fixes from turn guidance, one Google request for both legs, and fare exclusion of the driver's pickup journey. These checks do not measure GPS reception, Google latency, or mobile throughput on a physical device. Field validation in Germany and Syria remains outstanding.


## Shared driver-map and navigation position
DriverNavigation receives the exact phone point/revision already shown by the parent driver map and retains it while a new read is pending or fails. Unknown or old precision remains display-only and cannot enable turn instructions. Every successful browser/native fix publishes to the same measured in-memory stream; an older concurrent native request can resolve a navigation reader waiting on another request ID. Re-announcing the same point preserves its original measurement timestamp/accuracy, without extending its validity. Cancelled browser requests cannot publish late updates. A fresh shared fix recovers a failed navigation reader without turning every normal map update into another GPS request.

Regression tests reproduce concurrent upper-map/navigation requests, delivery to only the upper request, immediate navigation resolution from that fix, display-only unknown precision, preserved original measurement age, and cancelled fallback suppression.
