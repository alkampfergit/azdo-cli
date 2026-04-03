# Authentication

## PAT resolution order

1. `AZDO_PAT` environment variable
2. Stored credential from OS keyring
3. Interactive PAT prompt (then stored for next runs)

## Storing your PAT

The first time you run any command that needs a PAT you will be prompted interactively. The value is saved in your OS credential store so you are not prompted again.

You can also set it explicitly:

```bash
azdo config wizard   # guided setup including PAT
```

And remove it at any time:

```bash
azdo clear-pat
```

## OS credential store

| OS | Backend |
|----|---------|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (GNOME Keyring / KWallet) |

Linux users may need to install and start a Secret Service daemon before the keyring works.
See [linux-credential-store.md](linux-credential-store.md) for step-by-step instructions.

## CI / headless environments

For ephemeral environments, skip the keyring and set the environment variable directly:

```bash
export AZDO_PAT=<your-pat>
```

## Context resolution (org / project)

| Priority | Source |
|----------|--------|
| 1 | `--org` + `--project` flags |
| 2 | Saved config (`azdo config set org …`) |
| 3 | Azure DevOps `origin` git remote (auto-detected) |
