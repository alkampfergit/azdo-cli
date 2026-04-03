# Linux Credential Store Setup

`azdo-cli` uses [`@napi-rs/keyring`](https://github.com/napi-rs/keyring) to persist your PAT securely in the OS credential store. On Linux this library delegates to the **Secret Service API** (DBus), which is implemented by GNOME Keyring or KWallet.

Without a working Secret Service backend the PAT cannot be stored and you will be prompted on every run (or you can use the `AZDO_PAT` environment variable instead).

## Desktop environments (GNOME, KDE, XFCE, etc.)

Most modern Linux desktops already ship with GNOME Keyring or KWallet and start them automatically as part of the session. If `azdo store-pat` works without error you are done — no further setup needed.

## Headless / server / CI environments

On headless machines no Secret Service daemon is running. The two most common options are:

### Option A — `gnome-keyring-daemon` (recommended for interactive use)

1. Install the daemon and its dependencies:

   ```bash
   # Debian / Ubuntu
   sudo apt-get install gnome-keyring libsecret-1-0

   # Fedora / RHEL
   sudo dnf install gnome-keyring libsecret

   # Arch
   sudo pacman -S gnome-keyring libsecret
   ```

2. Start the daemon and expose its DBus socket:

   ```bash
   eval $(gnome-keyring-daemon --start --components=secrets)
   export GNOME_KEYRING_CONTROL GNOME_KEYRING_PID
   ```

   Add those lines to your `~/.bashrc` / `~/.zshrc` (or your session startup script) so the daemon starts automatically on login.

3. Unlock the keyring on first use. You will be prompted for a password the first time a secret is stored. On a headless machine you can unlock it non-interactively:

   ```bash
   echo "" | gnome-keyring-daemon --unlock
   ```

   This creates an **unencrypted** keyring — acceptable for a dev environment, but do not use it in production.

### Option B — `secret-tool` smoke-test (verify the stack works)

After starting the daemon, check that the Secret Service is reachable:

```bash
secret-tool store --label='test' foo bar   # store a dummy value
secret-tool lookup foo bar                 # retrieve it
```

If both commands succeed, `@napi-rs/keyring` will work correctly.

## Docker / CI — skip the keyring entirely

For ephemeral environments like Docker containers or GitHub Actions, storing a PAT in the keyring is unnecessary. Use the environment variable instead:

```bash
export AZDO_PAT=<your-pat>
azdo get-item 12345
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Error: org.freedesktop.DBus.Error.ServiceUnknown` | No Secret Service daemon running | Start `gnome-keyring-daemon` (see Option A) |
| `Error: org.gnome.keyring: couldn't connect` | `DBUS_SESSION_BUS_ADDRESS` not set | Run `export DBUS_SESSION_BUS_ADDRESS=$(dbus-launch --sh-syntax | grep ADDRESS | cut -d= -f2-)` before starting the daemon |
| Prompt on every run despite storing PAT | Keyring locked after daemon restart | Add the `--unlock` step to your startup script |
| Permission denied on `/run/user/<uid>/keyring` | Daemon started as a different user | Run the daemon as the same user that runs `azdo-cli` |
