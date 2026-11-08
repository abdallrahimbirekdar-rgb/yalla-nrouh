import json
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

bundle, manifest, readelf = sys.argv[1:]
root = ET.parse(manifest).getroot()
android_ns = '{http://schemas.android.com/apk/res/android}'
app = json.loads(Path('app.json').read_text())['expo']
assert root.attrib['package'] == app['android']['package']
assert root.attrib[android_ns + 'versionCode'] == str(app['android']['versionCode'])
assert int(root.find('uses-sdk').attrib[android_ns + 'targetSdkVersion']) >= 36
assert root.find('application').get(android_ns + 'debuggable') != 'true'
permissions = {
    entry.get(android_ns + 'name') for entry in root
    if entry.tag.startswith('uses-permission')
}
unexpected = permissions.intersection(app['android']['blockedPermissions'])
assert not unexpected, f'Unexpected permissions: {sorted(unexpected)}'
for permission in sorted(permissions):
    print(permission)

with ZipFile(bundle) as archive, tempfile.TemporaryDirectory() as directory:
    libraries = [
        name for name in archive.namelist()
        if name.startswith(('base/lib/arm64-v8a/', 'base/lib/x86_64/')) and name.endswith('.so')
    ]
    assert any('/arm64-v8a/' in name for name in libraries), 'ARM64 libraries missing'
    for name in libraries:
        file = Path(directory, 'library.so')
        file.write_bytes(archive.read(name))
        lines = subprocess.check_output([readelf, '-lW', file], text=True).splitlines()
        alignments = [int(line.split()[-1], 16) for line in lines if line.strip().startswith('LOAD ')]
        assert alignments and min(alignments) >= 0x4000, f'16 KB ELF alignment missing: {name}'
print('Bundle manifest and 16 KB native ELF alignment verified.')
