import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const root=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gradle=root('app/build.gradle');
const workflow=root('../.github/workflows/android-v08.yml');
const verify=root('tools/verify_apk.py');
const doc=root('docs/RC-SIGNING.md');
const rootIgnore=root('../.gitignore');

test('RC build carries versionCode 8 and versionName 0.8.0-rc1 with the same applicationId',()=>{
 assert.match(gradle,/versionCode 8\b/);
 assert.match(gradle,/versionName '0\.8\.0-rc1'/);
 assert.match(gradle,/applicationId 'org\.shinyakushin\.study\.next\.v07\.preview'/);
});

test('signing reads secrets from the environment and degrades safely',()=>{
 for(const key of ['RC_KEYSTORE_FILE','RC_STORE_PASSWORD','RC_KEY_ALIAS','RC_KEY_PASSWORD'])
  assert.ok(gradle.includes(`System.getenv('${key}')`),`missing ${key}`);
 assert.match(gradle,/def rcSigning = rcKeystorePath && rcStorePassword && rcKeyAlias && rcKeyPassword && file\(rcKeystorePath\)\.exists\(\)/);
 assert.match(gradle,/if \(rcSigning\) signingConfig signingConfigs\.rc/);
});

test('no key material or password is committed',()=>{
 assert.ok(!gradle.match(/storePassword\s*['"][^$]/),'no literal keystore password');
 assert.ok(!gradle.match(/keyPassword\s*['"][^$]/),'no literal key password');
 const tracked=rootIgnore.length>=0;
 assert.match(rootIgnore,/\*\.jks/);assert.match(rootIgnore,/\*\.p12/);assert.match(rootIgnore,/\*\.keystore/);
 assert.match(rootIgnore,/\*keystore\*\.b64/);
 assert.ok(!/BEGIN (RSA |EC )?PRIVATE KEY/.test(gradle+workflow+doc),'no private key block committed');
 assert.ok(!workflow.match(/storePassword\s*[:=]\s*['"][A-Za-z0-9]{8,}/),'no password literal in the workflow');
});

test('CI decodes the keystore into RUNNER_TEMP and never into the repository',()=>{
 assert.match(workflow,/printf '%s' \"\$RC_KEYSTORE_BASE64\" \| base64 --decode > \"\$keystore\"/);
 assert.match(workflow,/keystore=\"\$RUNNER_TEMP\/shin-yakushin-rc\.p12\"/);
 assert.match(workflow,/echo \"RC_KEYSTORE_FILE=\$keystore\"/);
 assert.match(workflow,/\} >> \"\$GITHUB_ENV\"/,'signing env is exported through GITHUB_ENV');
 assert.match(workflow,/if \[ -z "\$\{RC_KEYSTORE_BASE64:-\}" \]; then/,'no secrets context in a step if; guard at runtime');
 assert.match(workflow,/falling back to the throwaway debug key/);
 assert.ok(!/if: \$\{\{ secrets\./.test(workflow),'secrets is not an allowed context in step-level if');
});

test('the APK verifier pins the RC certificate and records it',()=>{
 assert.match(verify,/EXPECTED_SIGNING_CERT_SHA256/);
 assert.match(verify,/Signer #1 certificate SHA-256 digest/);
 assert.match(verify,/'signingCertSha256':signing_cert/);
 assert.match(verify,/assert signing_cert == expected_cert/);
 const pattern=/Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)/;
 const sample='Signer #1 certificate SHA-256 digest: 082513B4015567C3DB6D721F19D31DE11A44EDB5A19EE47DE8B5E71E2B92EF6E\n';
 assert.equal(sample.match(pattern)[1].toLowerCase(),'082513b4015567c3db6d721f19d31de11a44edb5a19ee47de8b5e71e2b92ef6e');
});

test('the pinned fingerprint is identical in the workflow and the runbook',()=>{
 const pinned=workflow.match(/EXPECTED_SIGNING_CERT_SHA256=([0-9a-f]{64})/);
 assert.ok(pinned,'workflow must pin the certificate');
 assert.ok(doc.includes(pinned[1]),'RC-SIGNING.md must document the same fingerprint');
 assert.match(doc,/versionCode 8/);assert.match(doc,/0\.8\.0-rc1/);
});

test('the QA scripts are read-only on the device',()=>{
 const check=root('tools/rc_signing_check.sh'),backup=root('tools/backup_app_state.sh');
 for(const [name,script] of [['rc_signing_check.sh',check],['backup_app_state.sh',backup]]){
  for(const danger of ['pm clear','adb_cmd install','adb_cmd uninstall','am force-stop','pm uninstall'])
   assert.ok(!script.includes(danger),`${name} must never run '${danger}'`);
 }
 assert.match(check,/verify --print-certs/);
 assert.match(check,/device cert:/);assert.match(check,/RESULT: MISMATCH/);
 assert.match(backup,/run-as/);assert.match(backup,/study\.sqlite3/);assert.match(backup,/SHA256SUMS\.txt/);
});
