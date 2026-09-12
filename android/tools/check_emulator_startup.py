"""Smoke-check the real UI on the disposable CI emulator; never clear app data."""
import os
import subprocess
import time
import json
import re
from pathlib import Path

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('This check only runs on the disposable GitHub CI emulator')

EMULATOR = ('adb', '-s', 'emulator-5554')
METRICS = []

def adb(*args, timeout=60):
    return subprocess.check_output([*EMULATOR, *args], timeout=timeout)

if adb('shell', 'getprop', 'ro.kernel.qemu').strip() != b'1':
    raise SystemExit('Refusing to run on a non-emulator device')

package = 'org.shinyakushin.study.next.v07.preview'
component = package + '/org.shinyakushin.study.next.MainActivity'
adb('shell', 'wm', 'dismiss-keyguard')

def assert_process_alive(label):
    pid = adb('shell', 'pidof', package).decode().strip()
    if not pid:
        raise AssertionError(label + ': app process is not alive')
    print(label + ': process alive pid=' + pid, flush=True)
    return pid

def assert_no_fatal_exception(label):
    pid = assert_process_alive(label)
    log = adb('logcat', '-d', '--pid=' + pid).decode(errors='replace')
    Path('app-startup-logcat.txt').write_text(log)
    matches = re.findall(r'STARTUP_LATENCY timeToUsableChat (\d+)ms', log)
    startup_ms = int(matches[-1]) if matches else None
    METRICS.append({'label': label, 'timeToUsableChatMs': startup_ms})
    print(label + ': timeToUsableChat=' + (str(startup_ms) + 'ms' if startup_ms is not None else 'not-observed'), flush=True)
    if 'FATAL EXCEPTION' in log:
        raise AssertionError(label + ': FATAL EXCEPTION in app logcat')
    crash = adb('logcat', '-d', '-b', 'crash').decode(errors='replace')
    Path('app-startup-crash.log').write_text(crash)
    if package in crash:
        raise AssertionError(label + ': crash buffer mentions ' + package)

def launch_and_check(label):
    launch = adb('shell', 'am', 'start', '-W', '-n', component).decode()
    print(launch, flush=True)
    # am start -W reports "Status: timeout" when the activity does not finish its
    # first draw inside its own window. A cold WebView start on a software GPU
    # can exceed that window even though the activity launched. The UI, process
    # and crash checks below are the real acceptance gate, so tolerate a -W
    # timeout but still reject a hard launch error.
    if 'Status: ok' not in launch and 'Status: timeout' not in launch:
        raise AssertionError('Activity launch did not complete: ' + launch.strip())
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            adb('shell', 'uiautomator', 'dump', '/sdcard/persistence-startup.xml', timeout=15)
            ui = adb('shell', 'cat', '/sdcard/persistence-startup.xml').decode()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            time.sleep(2)
            continue
        Path('app-startup-ui.xml').write_text(ui)
        if '記録を開けませんでした' in ui:
            print(ui, flush=True)
            raise AssertionError('Saved-state error screen is visible')
        if ('小夜とTTちゃん' in ui or '小夜とTちゃん' in ui) and '学ぶこと' in ui:
            print(label + ': PASS (Conversation UI visible)', flush=True)
            assert_no_fatal_exception(label)
            return
        time.sleep(2)
    raise AssertionError('Conversation UI did not become visible before deadline')

try:
    launch_and_check('APP_STARTUP')
    adb('shell', 'am', 'force-stop', package)
    launch_and_check('APP_RESTART_WITHOUT_CLEARING_DATA')
finally:
    Path('startup-metrics.json').write_text(json.dumps({'runs': METRICS}, ensure_ascii=False, indent=2))
    try:
        Path('app-startup.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
    try:
        Path('app-startup-crash.log').write_bytes(adb('logcat', '-d', '-b', 'crash'))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
