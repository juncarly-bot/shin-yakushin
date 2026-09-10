import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const main=fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/MainActivity.java',import.meta.url),'utf8');
const repo=fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/AppUsageRepository.java',import.meta.url),'utf8');
test('usage access bridge is optional and opens Android settings',()=>{assert.ok(main.includes('usageAccessAllowed()'));assert.ok(main.includes('openUsageAccessSettings()'));assert.ok(repo.includes('Settings.ACTION_USAGE_ACCESS_SETTINGS'))});
