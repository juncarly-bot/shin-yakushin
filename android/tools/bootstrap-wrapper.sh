#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Official Gradle 8.9 wrapper; verify before any execution. No system Gradle.
# Checksum reference: https://gradle.org/release-checksums/#v8.9
jar=gradle/wrapper/gradle-wrapper.jar
if [ ! -f "$jar" ]; then
  curl --fail --location --retry 3 --max-time 90 \
    https://raw.githubusercontent.com/gradle/gradle/v8.9.0/gradle/wrapper/gradle-wrapper.jar \
    --output "$jar"
fi
echo '498495120a03b9a6ab5d155f5de3c8f0d986a449153702fb80fc80e134484f17  gradle/wrapper/gradle-wrapper.jar' | sha256sum -c -
