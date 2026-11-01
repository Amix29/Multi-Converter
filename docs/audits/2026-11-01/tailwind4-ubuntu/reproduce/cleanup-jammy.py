#!/usr/bin/env python3
"""Stop only processes whose filesystem root is the owned test chroot."""
import os
from pathlib import Path
import signal
import time
root = '/home/ryadb/tailwind4-ubuntu-probe/jammy'
assert Path(root, 'etc/os-release').is_file()
def owned():
    result = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            if os.readlink(path / 'root') == root:
                result.append(int(path.name))
        except (OSError, PermissionError):
            pass
    return result
for pid in owned():
    os.kill(pid, signal.SIGTERM)
time.sleep(1)
for pid in owned():
    os.kill(pid, signal.SIGKILL)
for path in ['sys', 'proc', 'dev']:
    os.system('mountpoint -q ' + root + '/' + path + ' && umount ' + root + '/' + path)
print('Owned chroot processes stopped and mounts released')
