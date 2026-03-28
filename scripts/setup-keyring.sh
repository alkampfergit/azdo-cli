#!/usr/bin/env bash
# Sets up the GNOME Keyring default collection for headless environments
# (dev containers, CI). Safe to run multiple times.
#
# Prerequisites (Debian/Ubuntu):
#   apt-get install -y gnome-keyring libsecret-tools xvfb xdotool python3-dbus python3-gi
#
# Usage:
#   source scripts/setup-keyring.sh   # exports DBUS_SESSION_BUS_ADDRESS into current shell
#   OR
#   eval $(scripts/setup-keyring.sh)  # same effect

set -e

# If a keyring default collection already exists, nothing to do.
if secret-tool lookup service __keyring_probe__ account __none__ 2>&1 | grep -qv "No such object"; then
  exit 0
fi

# Check required tools
for cmd in Xvfb dbus-run-session gnome-keyring-daemon xdotool python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found. Install with:" >&2
    echo "  apt-get install -y gnome-keyring libsecret-tools xvfb xdotool python3-dbus python3-gi" >&2
    exit 1
  fi
done

# Pick a free display number
DISP=:55
rm -f /tmp/.X55-lock /tmp/.X11-unix/X55 2>/dev/null || true

# Start virtual display
Xvfb "$DISP" -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 1

cleanup() {
  kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT

export DISPLAY="$DISP"

# Run everything inside a fresh D-Bus session so the bus address is exported
dbus-run-session -- bash -c "
  export DISPLAY=$DISP
  export \$(echo -n '' | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)
  sleep 1

  python3 - <<'PYEOF'
import dbus
import dbus.mainloop.glib
from gi.repository import GLib
import subprocess, time

dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()

service_obj = bus.get_object('org.freedesktop.secrets', '/org/freedesktop/secrets')
service     = dbus.Interface(service_obj, 'org.freedesktop.Secret.Service')

props = dbus.Dictionary(
    {'org.freedesktop.Secret.Collection.Label': dbus.String('Default keyring')},
    signature='sv',
)
collection_path, prompt_path = service.CreateCollection(props, 'default')

if str(prompt_path) == '/':
    print('Keyring default collection already exists.')
    raise SystemExit(0)

# A prompt is required — handle it with GLib + xdotool
loop = GLib.MainLoop()

def on_completed(dismissed, value):
    loop.quit()

prompt_obj   = bus.get_object('org.freedesktop.secrets', str(prompt_path))
prompt_iface = dbus.Interface(prompt_obj, 'org.freedesktop.Secret.Prompt')
prompt_obj.connect_to_signal('Completed', on_completed,
    dbus_interface='org.freedesktop.Secret.Prompt')

prompt_iface.Prompt('')

def accept_dialog():
    env = {'DISPLAY': '$DISP'}
    subprocess.run(['xdotool', 'key', 'Return'], env=env, capture_output=True)
    time.sleep(0.3)
    subprocess.run(['xdotool', 'key', 'Return'], env=env, capture_output=True)
    return True

GLib.timeout_add(3000, accept_dialog)
GLib.timeout_add(10000, loop.quit)
loop.run()
print('Keyring default collection created.')
PYEOF
" 2>/dev/null

echo "Keyring setup complete."
exit 0
