// Upstream React Native 0.83/Gradle 9 compatibility fix:
// https://github.com/reactwg/react-native-releases/issues/1349
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'node_modules', '@react-native', 'gradle-plugin', 'settings.gradle.kts');
if (fs.existsSync(file)) {
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(
    'id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")',
    'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")'
  );
  if (updated !== original) fs.writeFileSync(file, updated);
}
