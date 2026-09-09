# VOICEVOX Android bundle checkpoint

The v0.7 build uses VOICEVOX Core 0.17.0 Android and ONNX Runtime 1.23.2-series
assets recovered from the previously verified v0.6 archive. The VVM files are
the official 0.17.0 release files:

```
15.vvm  c29b0c0f8e332fcedc2a5de4b4426feb75fc9f587c314da99af8dbc964287221
11.vvm  3fb0c0f12ec37fda568020509d6e63a0a6b5d6edf3c2330508c6bf4e3eeb8b82
```

Metadata verified previously: SAYO normal style 46; Nurse Robo Type T styles
47, 48, 49 and 50. The Japanese Open JTalk dictionary is kept out of GitHub
because `sys.dic` exceeds the GitHub single-blob limit. It is restored from the
durable v0.6 archive or the official VOICEVOX bundle before a build.

Native files are intentionally ignored in source Git history. Their checksums
are recorded after restoration. A build must refuse to claim a voice-ready APK
if both ABIs and the dictionary are not present.
