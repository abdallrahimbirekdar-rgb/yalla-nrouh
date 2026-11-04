## 0.8.0 — Android opens the live website
- Switch Android's home screen to the published website in a WebView, matching the Sooq Daraya update model. Install this transition APK once; ordinary website changes then appear on a fresh app open or safe Refresh page action.
- Keep the closer current-location zoom, native foreground location permission, local notifications, Android back navigation and external map/phone links.
- Import the old native saved state only when website storage is empty. Preserve newer website data.
- Check the published site version on resume and offer refresh without interrupting a ride or unfinished data.
- Keep website HTML fresh and reuse cached hashed assets. Initial website loading needs connectivity.
- No Expo Update account, publishing token or OTA service is required. Automatic APK builds are limited to wrapper/native inputs.

## 0.6.5 — Closer current-location view
- Zoom the home current-location camera to street/building level (19) on Android and web, including the My current location button.

## 0.6.4 — Start at the current location
- Centre the home Google map on a fresh foreground position after permission is granted, on web and Android.
- Add My current location to re-centre, with a blue location marker and clear permission/GPS/timeout states.
- Keep manually chosen pickup/address intact; a late GPS response cannot move the camera after manual selection.

## 0.6.3 — Google Maps on both platforms
- Use Maps JavaScript API on web and the Google SDK on Android, with the shared booking interface and centred logo.
- Remove active OSM fallback; slow connections keep the Google provider.
- Require a separate website-restricted Maps JavaScript key for web deployment.

## 0.6.2 — Automatic maps and balanced branding
- Open maps automatically, wait offline, and keep selected points through network changes.
- Use passive connection hints and data saver for lighter map details, without speed-test downloads or prefetching.
- Centre the approved compact logo in a separate header, leaving the map clear.

# Changes

## 0.3.0

- هوية داكنة جديدة بتدرجات بنفسجية وزرقاء مستوحاة من المرجع المرئي.
- خط Cairo وأيقونات واضحة وشريط تنقل سفلي ثابت.
- بطاقات رحلات في عمودين ونماذج عناوين محسنة.
- إعادة تنسيق شاشات الرحلة والسائق والإدارة والسجل.
- أيقونة تطبيق وشاشة بدء جديدتان.
- رفع Android versionCode إلى 3 مع الحفاظ على معرف الحزمة ومفتاح توقيع الاختبار.


## 0.2.0

- شاشة لاختيار نقطة الانطلاق والوصول مع وصف المكان.
- خريطة أصلية قابلة للضغط وسحب العلامة في تطبيق الهاتف؛ يحتاج أندرويد مفتاح المزود عند البناء.
- زر لطلب الموقع الحالي عند رغبة المستخدم فقط.
- إدخال يدوي للإحداثيات يدعم الأرقام العربية والإنكليزية.
- حفظ إحداثيات الرحلة والتحقق منها مع الحفاظ على توافق سجل الإصدار السابق.
- مسح إحداثيات العنوان القديم عند تحريره.
- عميل بحث عناوين قابل للربط بالخادم، مع تحقق من البيانات ومعالجة انقطاع الاتصال والمهلة.
- شاشة إدارة توضح حالة كل خدمة دون تقديم الحجز التجريبي كحجز فعلي.
- توثيق متطلبات الخرائط وعقد خدمة البحث.

## 0.1.0

العربية والإنكليزية، الفئات الست، حجز تجريبي، اعتماد سائق محلي، تتابع الرحلة برمز بدء، سجل وتقييم وحفظ محلي.
