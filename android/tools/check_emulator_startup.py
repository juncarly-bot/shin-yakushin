"""Smoke-check the real UI on the disposable CI emulator; never clear app data."""
import os
import subprocess
import time
from pathlib import Path

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('This check only runs on the disposable GitHub CI emulator')

EMULATOR = ('adb', '-s', 'emulator-5554')

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
    if 'FATAL EXCEPTION' in log:
        raise AssertionError(label + ': FATAL EXCEPTION in app logcat')
    crash = adb('logcat', '-d', '-b', 'crash').decode(errors='replace')
    Path('app-startup-crash.log').write_text(crash)
    if package in crash:
        raise AssertionError(label + ': crash buffer mentions ' + package)

def launch_and_check(label):
    launch = adb('shell', 'am', 'start', '-W', '-n', component).decode()
    print(launch, flush=True)
    if 'Status: ok' not in launch:
        raise AssertionError('Activity launch did not complete')
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
        if '小夜とTちゃん' in ui and '学ぶこと' in ui:
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
    try:
        Path('app-startup.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
    try:
        Path('app-startup-crash.log').write_bytes(adb('logcat', '-d', '-b', 'crash'))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
