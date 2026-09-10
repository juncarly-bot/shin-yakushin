import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
test('settings exposes life balance controls and all modes',()=>{for(const x of ['生活バランス','ENTERTAINMENT','STUDY','NEUTRAL','NORMAL','HOLIDAY','FOCUS','UNLIMITED','cooldownMinutes'])assert.ok(ui.includes(x),x)});
test('settings UI represents entertainment and study app examples',()=>{assert.ok(ui.includes('YouTube + X'));assert.ok(ui.includes('Chrome + ChatGPT'))});
