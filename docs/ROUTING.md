# Google Maps, location permission and fares — 0.6.0

## Working without Google credentials
One passenger/driver APK. Introductory location explanation on first use, a user-initiated foreground OS prompt, continuation without permission, and permission/GPS checks in settings and driver mode. No background permission is requested. Notifications remain separately opt-in.

Official Maps URLs open directions or navigation in the Google Maps app, or the browser if no Maps app is available. They need no API key or Google Cloud billing. Driver navigation omits the origin so Google Maps can use its own current-location permission. Review directions pass chosen pickup/destination coordinates or manually entered addresses. The UI discloses that those endpoints are shared only on a button tap. Navigation runs in Google Maps, not in an embedded voice-navigation SDK.

## Embedded Android map — prepared, not active without the key
`react-native-maps` uses PROVIDER_GOOGLE only when `GOOGLE_MAPS_ANDROID_API_KEY` is configured. The public SDK key must be restricted to Maps SDK for Android, package `com.yallanrouh.demo` and the actual signing certificate SHA-1. Put it in the repository Actions secret of the same name. The build reads it during prebuild and native bundling; app metadata stores only a configured boolean. The existing map picker is retained and explicitly labelled temporary while no key is supplied. Google route content is never drawn on that picker.

A Google Cloud project and active billing setup are required by Google for SDK setup, even where Maps SDK map loads are no-charge. No billing account, API key or quota is created by this change. Maps SDK free map loads do not imply all Google products are free. The owner must supply/authorize the project setup before it can be activated.

## تفعيل خرائط Google الأصلية في APK التجريبي

هذا الإعداد خاص **بعرض الخريطة داخل تطبيق Android** باستخدام `react-native-maps`، ولا يفعّل وحده حساب المسافة أو رسم طرق القيادة. المفتاح **غير موجود حاليًا** في إعدادات GitHub، لذلك يعود التطبيق إلى OpenStreetMap حتى إضافته.

1. افتح [Google Cloud Console](https://console.cloud.google.com/apis/credentials) وأنشئ مشروعًا للخرائط، أو اختر مشروعًا تملكه. تأكد من تفعيل الفوترة حسب متطلبات Google، ثم فعّل خدمة **Maps SDK for Android** فقط.
2. أنشئ **API key** خاصًا بنسخة Android. في **API restrictions** اختر **Restrict key** ثم **Maps SDK for Android**. في **Application restrictions** اختر **Android apps** وأضف:
   - Package name: `com.yallanrouh.demo`
   - SHA-1 لتوقيع APK الحالي (Android Debug للاختبار فقط): `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
3. داخل [GitHub Actions secrets](https://github.com/abdallrahimbirekdar-rgb/yalla-nrouh/settings/secrets/actions)، اختر **New repository secret**، واجعل الاسم `GOOGLE_MAPS_ANDROID_API_KEY` والقيمة مفتاح Google الذي أنشأته. **لا تضع المفتاح في المستودع أو المحادثة**.
4. إضافة Secret لا تشغّل البناء تلقائيًا. من [Build Android test APK](https://github.com/abdallrahimbirekdar-rgb/yalla-nrouh/actions/workflows/android-apk.yml)، اختر **Run workflow** على `main`.
5. تأكد من ظهور **Google Maps: configured in Android manifest** في ملخص البناء، ثم افحص نجاح APK والتوقيع وانشره. ثبّت أحدث APK واختبر تحميل مربعات الخريطة والتحريك وتحديد موقع الانطلاق والوصول على هاتف Android متصل بالإنترنت.
6. عند ظهور خريطة فارغة، راجع Maps SDK والفوترة وتقييد المفتاح بالاسم وبصمة توقيع الملف الذي ثُبّت فعلًا. ملخص GitHub Actions يعرض SHA-1 لكل بناء، دون نشر مفتاح Google. بعد تعذّر التحميل، يتيح التطبيق استخدام خريطة بديلة.

**تنبيه التوقيع:** ملف الاختبار الحالي موقّع بشهادة Android Debug، ولا تصلح للنشر التجاري أو إصدار Google Play. استخدم توقيع إصدار ثابتًا وخاصًا بالتطبيق للإنتاج، وأضف بصمته الجديدة إلى قيود المفتاح قبل توزيع النسخة النهائية.

**التكلفة:** تُدرج Google خدمة **Maps SDK** للهواتف ضمن الخدمات ذات الاستخدام غير المحدود دون رسوم للخريطة الأساسية، لكن إعداد مشروع Google Maps لا يزال يتطلب تفعيل الفوترة. خدمات **Places / Routes / Street View** مستقلة وقد تكون مدفوعة، ولا يفعّل هذا التعديل أيًا منها تلقائيًا. راجع [قائمة الأسعار الرسمية](https://developers.google.com/maps/billing-and-pricing/pricing) قبل تفعيل خدمات أخرى.

## Optional Google Routes backend contract
The app never calls Routes REST with an embedded server key and has no public OSRM fallback. No route API request is sent when `EXPO_PUBLIC_GOOGLE_ROUTES_PROXY` is unset. To prepare the CI value, set repository variable `GOOGLE_ROUTES_PROXY_URL` to the protected project backend base URL, after the authenticated booking backend is available.

Client: `POST /v1/google/routes`, JSON `{origin:{latitude,longitude},destination:{latitude,longitude},languageCode:"ar"}`. The server must validate callers and coordinates, enforce shared quotas/rate limits and protect its own `GOOGLE_ROUTES_API_KEY`. Return a standard Google Compute Routes response with these selected fields: `routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction`.

Suggested server request: DRIVE, TRAFFIC_UNAWARE, no alternatives/intermediate waypoints, polylineEncoding GEO_JSON_LINESTRING, and an explicit field mask. Do not enable higher-priced traffic features without a separate decision. Reject requests after the configured project-wide usage cap; Google budget alerts alone do not stop spending. Free usage is shared according to Google's billing rules, so caps must account for other projects/SKUs and the billing account. This repository does not deploy a Routes backend or activate billing.

The parser validates bounded metrics, geometry and text instructions. Requests are on demand, cancellable, time-limited and throttled. Responses remain in the current screen's memory and are not cached on disk. Display geometry only on a configured Google map; otherwise display attributed Google Maps text and offer the official navigation link. Offline storage of the app's own user/GPS data is separate from Google route data.

## Price calculation

For **new** trips, the owner-specified equation is:

`fare = round((starting fare + (distance_km × price_per_km) + (ride_minutes × price_per_minute)) × peak_multiplier)`

The four configurable constants are editable in **Demo admin**. Peak multiplier **1** is normal pricing, **1.5** adds 50%, and **2** doubles the subtotal. A minimum charge is not added to this new formula. The app uses the same calculation in the local GPS meter and, when Google Routes integration is configured, the pre-ride road-distance estimate. Final fares use GPS distance and elapsed ride time; Google road-distance estimates must not substitute for the recorded journey. Prices are rounded to whole SYP.

Existing saved ride snapshots without a peak factor retain their *previous* minimum-fare calculation, to avoid retroactively changing historical fares. Newly started rides normalize old rates to the new equation with multiplier 1. Each new ride keeps its own rate snapshot at start; subsequent admin edits never modify it.

**Current scope:** Admin changes are saved locally in the demo on the same website/browser device. The admin page is an open demonstration, not a protected control panel. Before this formula can be enforced across passengers and drivers, the project needs authenticated administrator roles, a central pricing database, versioned/signed tariff responses, server validation and a production trip service. No default rates are invented. GPS gaps mark ride data incomplete; the estimate is not an official charge, and cash remains the only demo payment method.

## Official references (verify again before activation)
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/android-sdk/usage-and-billing
- https://developers.google.com/maps/documentation/routes/usage-and-billing
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/maps/documentation/routes/policies
