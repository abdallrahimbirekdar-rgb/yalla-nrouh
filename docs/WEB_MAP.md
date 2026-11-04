> Current Android behavior from 0.8.0: the installed app opens the live Google Maps website in a WebView. See WEBSITE_APP.md. Native-screen details below describe the earlier 0.6.x builds. No Expo Update service is used.

# Google Maps on web and Android (0.6.3)

Both platforms share the same booking screen, compact centred approved logo, automatic map mounting, manual addresses, map selection and driver/passenger menu. Web uses the official Maps JavaScript API. Android uses Maps SDK for Android. Connection changes never switch to OpenStreetMap. Google controls actual tile quality/downloads; the app uses passive network hints and reduces optional details, without speed-test downloads.

## Website setup

1. In Google Cloud project `yalla-nrouh-513715`, enable **Maps JavaScript API**. Its project billing/quota prerequisites must be satisfied. Do not change the working Android key.
2. Create a separate public website key. Application restriction: **Websites / HTTP referrers**, permitting `https://abdallrahimbirekdar-rgb.github.io/*` (GitHub Pages may send only the origin as referrer). API restriction: **Maps JavaScript API** only. Add any custom site origin explicitly.
3. Save it in this repository's Actions secret **GOOGLE_MAPS_WEB_API_KEY**. The web workflow exposes it to Expo as `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` at export time. This public browser key is visible to visitors; restrictions provide its protection. Never use an Android-restricted key or Routes server key here.
4. Optionally set repository variable `GOOGLE_MAPS_WEB_MAP_ID` to an owned JavaScript map ID. Until one is set, Google's supported `DEMO_MAP_ID` enables advanced draggable markers.
5. Run the web workflow and verify tap selection, marker drag, address fields, route display and reconnection on the live origin. Local preview is not an allowed origin unless explicitly configured.

Missing or rejected keys show a clear Google-unavailable state while manual entry stays usable. There is no OSM fallback. The web loader shares a single SDK request and does not reload an already working map on every connection event. No Google route content is persisted on disk.

## Android

Retain repository secret `GOOGLE_MAPS_ANDROID_API_KEY`, restricted to package `com.yallanrouh.demo`, its signing SHA-1 and Maps SDK for Android. The native CI fails when that key is absent. A new APK is required for native changes.
