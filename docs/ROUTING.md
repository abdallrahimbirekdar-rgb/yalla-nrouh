# Google Maps, location permission and fares — 0.6.0

## Working without Google credentials
One passenger/driver APK. Introductory location explanation on first use, a user-initiated foreground OS prompt, continuation without permission, and permission/GPS checks in settings and driver mode. No background permission is requested. Notifications remain separately opt-in.

Official Maps URLs open directions or navigation in the Google Maps app, or the browser if no Maps app is available. They need no API key or Google Cloud billing. Driver navigation omits the origin so Google Maps can use its own current-location permission. Review directions pass chosen pickup/destination coordinates or manually entered addresses. The UI discloses that those endpoints are shared only on a button tap. Navigation runs in Google Maps, not in an embedded voice-navigation SDK.

## Embedded Android map — prepared, not active without the key
`react-native-maps` uses PROVIDER_GOOGLE only when `GOOGLE_MAPS_ANDROID_API_KEY` is configured. The public SDK key must be restricted to Maps SDK for Android, package `com.yallanrouh.demo` and the actual signing certificate SHA-1. Put it in the repository Actions secret of the same name. The build reads it during prebuild and native bundling; app metadata stores only a configured boolean. The existing map picker is retained and explicitly labelled temporary while no key is supplied. Google route content is never drawn on that picker.

A Google Cloud project and active billing setup are required by Google for SDK setup, even where Maps SDK map loads are no-charge. No billing account, API key or quota is created by this change. Maps SDK free map loads do not imply all Google products are free. The owner must supply/authorize the project setup before it can be activated.

## Optional Google Routes backend contract
The app never calls Routes REST with an embedded server key and has no public OSRM fallback. No route API request is sent when `EXPO_PUBLIC_GOOGLE_ROUTES_PROXY` is unset. To prepare the CI value, set repository variable `GOOGLE_ROUTES_PROXY_URL` to the protected project backend base URL, after the authenticated booking backend is available.

Client: `POST /v1/google/routes`, JSON `{origin:{latitude,longitude},destination:{latitude,longitude},languageCode:"ar"}`. The server must validate callers and coordinates, enforce shared quotas/rate limits and protect its own `GOOGLE_ROUTES_API_KEY`. Return a standard Google Compute Routes response with these selected fields: `routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction`.

Suggested server request: DRIVE, TRAFFIC_UNAWARE, no alternatives/intermediate waypoints, polylineEncoding GEO_JSON_LINESTRING, and an explicit field mask. Do not enable higher-priced traffic features without a separate decision. Reject requests after the configured project-wide usage cap; Google budget alerts alone do not stop spending. Free usage is shared according to Google's billing rules, so caps must account for other projects/SKUs and the billing account. This repository does not deploy a Routes backend or activate billing.

The parser validates bounded metrics, geometry and text instructions. Requests are on demand, cancellable, time-limited and throttled. Responses remain in the current screen's memory and are not cached on disk. Display geometry only on a configured Google map; otherwise display attributed Google Maps text and offer the official navigation link. Offline storage of the app's own user/GPS data is separate from Google route data.

## Price calculation
`max(minimum, base + kilometres × per-km rate + full ride minutes × per-minute rate)`.

The current local meter already uses accepted GPS distance and elapsed ride time. It starts only after the ride PIN is verified and ends on completion. The rate is copied at ride start; later admin changes do not change that ride. Travel to pickup is excluded. GPS gaps are marked incomplete and do not fabricate kilometres or a final payable fare. Prices are manually configured in demo admin; none are invented. A pre-ride road-price estimate remains unavailable until the Google Routes backend is connected. It would use Google's road distance/time, not straight-line distance. Real settlement, shared prices and driver dispatch still need the booking server.

## Official references (verify again before activation)
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/android-sdk/usage-and-billing
- https://developers.google.com/maps/documentation/routes/usage-and-billing
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/maps/documentation/routes/policies
