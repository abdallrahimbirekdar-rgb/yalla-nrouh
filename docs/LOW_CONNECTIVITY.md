> Version 0.6.0 update: the owner selected Google Maps. Free external Google navigation is active; native Google SDK is wired but awaits its key. The prior map picker is a labelled temporary fallback. Google route content is not cached to disk, and no public OSRM route fallback is enabled. See ROUTING.md for current behavior.

# Low-connectivity build 0.5.1

## Implemented
- The same SQLite key is retained. A versioned storage envelope saves app state and partial booking draft together, with migration from older installs. Browser storage mirrors this behavior. Writes are serialized, pending snapshots coalesce, failures are visible and retryable.
- Data saver is enabled by default. A map is mounted only after an explicit request. OpenStreetMap raster tiles load for the visible area only. Native Leaflet code and styles are packaged with the application rather than fetched from a CDN. Standard browser/WebView HTTP caching is allowed; there is no city prefetch or guaranteed offline tile pack.
- Driver GPS recording is opt-in, only during a riding trip and while the app is in the foreground. Balanced accuracy, 10-second minimum interval and 20-metre distance interval. Last 2,000 route fixes are retained; total accepted distance remains cumulative. Bad accuracy, stale fixes, rapid callbacks, jumps and recording gaps cannot add fabricated distance. Backgrounding or restarting marks a recording incomplete and prevents connecting an old point across the gap.
- Wall-clock trip duration survives restarts. Rates are entered by the demo administrator and snapshotted at ride start. The local estimate is explicitly not an official fare, particularly when GPS coverage is incomplete. No default fares are invented.
- Light, dark and system themes, with reduced animation. Local status notifications require explicit permission and only reflect state changes already known to this device.
- SMS opens the phone's normal composer with a visible demo message and a configured recipient. The user reviews and sends it. Sending does not change booking status or imply acceptance. No READ_SMS, RECEIVE_SMS, SEND_SMS or background location permissions are requested.
- Native build removes Google Maps, unused gradient and vector style libraries, imports only used Cairo fonts and avoids the unused filled Material-font barrel via the standard Expo font hook, enables release minification/resource shrinking, sets Android min SDK 24 and produces one unified APK with both ARM64 and ARM32 libraries and both passenger/driver modes. APK sizes must be measured after release builds; minimum OS is a build target, not a claim of physical-device testing.

## Services still required for live use
This remains a single-device demo. There is no authenticated booking server, driver identity, real dispatch, shared pricing or real-time transport. No queued demo request is silently promoted to a real request when internet returns.

A production sync transport needs authenticated user/driver roles, a trip-scoped journal with stable event IDs, per-trip monotonic sequence numbers, server acknowledgments, reconnect with exponential backoff, deduplication, replay and server reconciliation before money or status changes. Use one authenticated WebSocket or MQTT connection while a live trip needs updates; avoid repeated HTTP location polling. Persist unacknowledged events transactionally before sending; delete only after a matching server acknowledgment. GPS records must be scoped to the correct trip and server consent/retention rules.

Automatic SMS and inbound booking replies require a contracted local SMS provider and server integration. Delivery receipts are separate from trip acceptance. Mobile composer return values do not prove delivery. Syriatel Cash, MTN Cash or banking require merchant credentials and provider APIs, server verification, idempotent payment records and reconciliation. Those services are not represented as connected.

## Verification
Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, web export and native export. CI builds one APK containing both phone architectures. Before live service, test on real Android 7/8 devices, loss/recovery of connectivity, a power cycle, storage-full errors, locked-screen behavior, notification permission denial and actual SMS/carrier delivery. There is no background GPS service in this build.
