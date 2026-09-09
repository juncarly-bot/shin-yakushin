"""Developer build preflight; never downloads tools or installs/overwrites an app."""
import os, shutil, subprocess, sys, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sdk=Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '/nonexistent-android-sdk')
gradle=shutil.which('gradle')
missing=[]
if not shutil.which('java'): missing.append('JDK 17 (java)')
if not gradle: missing.append('Gradle 8.9 on PATH')
if not (sdk/'platforms/android-35/android.jar').exists(): missing.append('Android SDK platform 35; set ANDROID_HOME')
if not (sdk/'build-tools/35.0.0').exists(): missing.append('Android build-tools 35.0.0')
if not (sdk/'cmake/3.22.1/bin/cmake').exists(): missing.append('Android CMake 3.22.1')
if not (sdk/'ndk').is_dir(): missing.append('Android NDK (compatible with AGP 8.7.3)')
for name in ['voicevox/include/voicevox_core.h','jniLibs/arm64-v8a/libvoicevox_core.so','jniLibs/arm64-v8a/libvoicevox_onnxruntime.so','assets/voicevox/manifest.json']:
 if not (root/'app/src/main'/name).is_file(): missing.append(name)
if missing:
 print('BUILD BLOCKED: prerequisites missing:'); print('\n'.join('- '+x for x in missing));sys.exit(2)
r=subprocess.run([gradle,'--no-daemon',':app:assembleDebug',':app:lintDebug'],cwd=root)
if r.returncode: sys.exit(r.returncode)
apk=root/'app/build/outputs/apk/debug/app-debug.apk'
print('APK size:',apk.stat().st_size); print('APK:',apk); print('SHA-256:',hashlib.sha256(apk.read_bytes()).hexdigest())
