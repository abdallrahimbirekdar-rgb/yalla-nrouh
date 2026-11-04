# Yalla Nrouh — connected Supabase beta (not a transport service)

## Current separation

The existing local demo remains independent. The **Server rides beta** screen at `/cloud` connects to the separate project `gokosprcqpdvqgahvquk` (Frankfurt). It does not change the earlier Beep Beep Daraya project. The public *publishable* Supabase key is embedded in the app; **no secret/service-role key** is embedded.

The rider and driver must each use a different, confirmed Supabase Auth email account on separate devices to test the two-device flow. Sessions stay in process memory only: neither password nor access token is written to local persistent storage. Sign in again after restarting.

## Server objects (created by Supabase migrations)

- `public.rides`: trip and status, ownership, precise endpoints (RLS: only rider/assigned driver can read).
- `public.driver_accounts`: driver onboarding, approval and availability (RLS: own record).
- `private.admins`: approved staff identities, not exposed to the Data API.
- `private.ride_pins`: six-digit passenger start PINs, not exposed to clients.
- Privileged RPCs: `request_ride`, `passenger_ride_pin`, `cancel_ride`, `register_driver`, `set_driver_online`, `driver_heartbeat`, `open_ride_previews`, `accept_ride`, `advance_ride`, `is_staff_admin`, `admin_pending_drivers`, and `admin_review_driver`.

The functions use an authenticated user's ID, explicit checks, a fixed search path and narrow execute grants. Unauthenticated users cannot call these RPCs. An accepted ride is assigned atomically, and unique indexes prevent more than one active ride per rider or driver. Driver feed previews show approximate pickup coordinates rather than full passenger addresses. Live route location tracking and commercial pricing **are not connected**.

## One-time administrator setup (manual, authenticated owner only)

New staff accounts are **never** granted administrator privileges merely because they registered. After creating and verifying your intended administrative Auth account, inspect its ID in Supabase Auth > Users. Then in the **Yalla Nrouh** project's SQL editor, insert that one exact verified user UUID into `private.admins`. Double-check the UUID before inserting. Do not expose any admin bootstrap SQL endpoint in the client.

You can then sign into Server rides beta with that admin account and review the pending driver applications there. Do not approve a real person until their identity, licensing and vehicle documents have been verified outside this beta.

## Test flow

1. In the app, open **Test server booking**. Create two test accounts (verify email if prompted).
2. On device A, sign in as passenger. Select two different map points, then create a test request. A six-digit PIN is displayed only to the passenger.
3. On device B, sign in as driver. Register once with a region and vehicle category, then wait for explicit admin approval.
4. A verified admin account approves the driver. Driver enables availability and refreshes requests (same region and category).
5. Driver accepts the request. Both users can refresh to see status; driver marks arrived, asks the passenger for their six-digit PIN, starts and completes.
6. Confirm a different driver's attempt to claim an already accepted request does not succeed.

## Known limits

- This is an **opt-in foreground-polling beta**, not real-time customer dispatch. The screen refreshes approximately every 20 seconds, or every 60 seconds in data-saver mode, while open in the foreground. Data is never synchronized in the background. Availability heartbeats occur only while the beta screen is open.
- The driver can open Google Maps navigation to the pickup point after accepting, and to the passenger destination once the ride is started. This uses external Google Maps navigation, not an embedded navigation SDK.
- Choosing departure/arrival on the map returns to the cloud beta screen with the coordinates intact. The start PIN appears beside its own ride only.
- Missing: automatic assignment, persistent login/refresh, push messages, background GPS, fare quotes from a trusted routing backend, actual price rules, payments, driver documents, customer support, final deployment verification, privacy and account-deletion flows.
- Google Maps external navigation can open without a Google key, but embedding Google's maps and calculating roads with Google Routes needs separately configured credentials, billing and quotas.
- Do not run this as a real taxi service or store real customers' location data before privacy, retention, security and field testing are complete.

## Verify

`npm ci && npm run typecheck && npm test && npm run lint`. The web workflow runs typecheck and tests before export. Android APK must also pass its separate workflow and a physical two-phone test; a source-code commit does not prove the build worked.
