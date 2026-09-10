"""Inspect the built APK, not the Gradle source or hardcoded metadata."""
import hashlib, json, os, re, struct, subprocess, sys, zipfile
from pathlib import Path

apk = Path(sys.argv[1])
expected = sys.argv[2]
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
bt = sdk / 'build-tools/35.0.0'
badging = subprocess.check_output([str(bt/'aapt'), 'dump', 'badging', str(apk)], text=True)
package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
assert package and package[1] == expected, 'Unexpected APK applicationId'
assert "sdkVersion:'26'" in badging and "targetSdkVersion:'35'" in badging
signature = subprocess.check_output([str(bt/'apksigner'), 'verify', '--verbose', str(apk)], text=True)
patterns = [rb'sk-[A-Za-z0-9_-]{20,}', rb'OPENAI_API_KEY', rb'api\.openai\.com', rb'Authorization: Bearer']
with zipfile.ZipFile(apk) as z:
    for entry in z.infolist():
        if entry.is_dir(): continue
        data = z.read(entry)
        for pattern in patterns:
            assert not re.search(pattern, data), 'Secret-like content in '+entry.filename
    for abi, machine in [('arm64-v8a', 183), ('x86_64', 62)]:
        for lib in ['libvoicevox_core.so', 'libvoicevox_onnxruntime.so', 'libstudy_voice.so']:
            data = z.read('lib/'+abi+'/'+lib)
            assert data[:4] == b'\x7fELF' and data[4] == 2 and data[5] == 1
            assert struct.unpack_from('<H', data, 18)[0] == machine, 'Wrong ABI '+abi+'/'+lib
    manifest = json.loads(z.read('assets/voicevox/manifest.json'))
    for name, sha in manifest['files'].items():
        if name.endswith('.vvm') or name.startswith('dict/'):
            assert hashlib.sha256(z.read('assets/voicevox/'+name)).hexdigest() == sha, name
sha = hashlib.sha256(apk.read_bytes()).hexdigest()
Path('APK-SHA256SUMS.txt').write_text(sha+'  '+str(apk)+'\n')
metadata = {'applicationId':package[1], 'versionCode':package[2], 'versionName':package[3],
            'sha256':sha, 'size_bytes':apk.stat().st_size, 'secretScan':'NONE',
            'abis':['arm64-v8a','x86_64'], 'signatureVerified':True,
            'deviceVoicePlayback':'NOT VERIFIED', 'commit':os.environ.get('GITHUB_SHA')}
Path('APK-METADATA.json').write_text(json.dumps(metadata, indent=2)+'\n')
Path('APK-BADGING.txt').write_text(badging)
Path('APK-SIGNATURE.txt').write_text(signature)
print(json.dumps(metadata, indent=2))
