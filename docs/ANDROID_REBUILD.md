# يلا نروح — Android 1.0.0: clean native host

This rewrite starts from new source in src/android-fresh/. The previous Android
source remains in the repository for reference, but the Android entry point
imports only this rebuilt host. The website, Supabase account system, fare
calculation, saved places and admin controls are unchanged.

Architecture:
- Website: the existing GitHub Pages site, loaded through a single secure WebView.
  UI changes still deploy through the web workflow without an APK rebuild.
- Android: its own native foreground GPS permission and location provider.
  Browser WebView geolocation is intentionally off to avoid a second prompt.
- Every location request has a fresh cancellation controller. A request cancelled
  by backgrounding cannot prevent a new request when returning to the app.
- First launch requests foreground permission once per process. Manual requests
  share an in-flight request. Permission is reported to the website again during
  bootstrap and on app resume; the page can start its auto-centering after grant.
- A recent, accurate cached fix can paint the map quickly, while a measured fresh
  fix follows. GPS uses Balanced accuracy first, then High accuracy. Driver
  samples require <=50m accuracy; passenger pickup <=150m.
- Location operations end with success, a typed error or timeout. Settings
  never wait for GPS. No background location is requested.
- No native file migration, no native account duplication and no automatic
  refresh while a website draft is in progress.
- The Android package is unchanged for in-place update; version increases to
  1.0.0 (20). Production signing remains a separate requirement.

Physical-device tests REQUIRED before calling the issue fixed:
1. Fresh install, grant precise permission once, verify the map zooms to actual
   current location and pickup marker updates.
2. Update over 0.9.1; verify settings and saved website data remain available.
3. Turn GPS off, deny permission, select approximate location: show useful errors.
4. Return from Android system permissions; try location and Settings repeatedly.
5. Background/foreground during an ongoing fix, then tap My Location again.
6. Test website-only updates and Google Maps/Places search and 500m pickup rule.
7. Test passenger and driver separately on a physical Android device.

GitHub tests and a built APK confirm compilation, not real GPS reception.


## 1.0.1 Android geolocation diagnostic fix
- The home map no longer claims Damascus is the passenger's live location.
- The native host can obtain foreground GPS and place a recent result into
  window.__YALLA_NATIVE_AUTOFIX__ even without a web->native location request.
- WebView JavaScript geolocation is now enabled as a secondary passenger location
  provider (mirrors the phone-browser API), delayed 1.5 seconds so a working
  native bridge remains the first choice and does not prompt unnecessarily.
- Fallback runs only after Android foreground permission is confirmed; the
  driver fare meter still requires native, accurate timestamped GPS.
- WebView cancellation explicitly stops a pending native watcher when the
  secondary location source wins.
- The APK needs rebuilding for Android WebView geolocation; website-only
  location logic and placeholder remain live-updatable after that.
- Android physical-device tests are mandatory before claiming resolution.
