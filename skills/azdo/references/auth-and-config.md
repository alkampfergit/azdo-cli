# Authentication and configuration

## Credentials

The CLI uses the first of:

1. the `AZDO_PAT` environment variable;
2. the credential stored for the organization by `azdo auth login` (OS
   credential store, or DPAPI files on Windows);
3. `AZDO_PAT` in a `.env` file, searched upwards from the working directory.

`AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_EXT_PAT` and `AZDO_TOKEN` are ignored.

```bash
azdo auth status --json                 # stored credentials per org — never the token
azdo auth status --org myorg --json
azdo auth diagnose --json               # authType, credentialSource, org, project, connectivityStatus, identity
```

- `azdo auth login --org myorg` signs in with OAuth in a browser;
  `--device-code` prints a code instead; `--use-pat` prompts for a PAT. These
  are interactive: ask the user to run them. In automation, set `AZDO_PAT`, or
  pipe the token: `azdo auth login --org myorg --use-pat --from-stdin`.
- `azdo auth logout --org myorg` (or `--all`) removes stored credentials. Do
  not run it unless the user asked.
- `identity` in `auth diagnose --json` is the account the token belongs to.
  Compare `identity.uniqueName` with a PR's `createdByUniqueName`, or
  `identity.id` with a comment's `authorId`.

### Scopes a PAT needs

| Commands | Scope |
| --- | --- |
| work item reads | Work Items (Read) |
| work item writes, comments, attachments, relations | Work Items (Read & Write) |
| `pr list`, `pr status`, `pr comments`, `pr reviewers list` | Code (Read) |
| other `pr` writes | Code (Read & Write) |
| `pr work-items link` / `unlink` | also Work Items (Read & Write) |
| `pr reviewers add` / `remove` | also Identity (Read) |
| `pipeline` commands | Build (Read), Build (Read & execute) for `pipeline start` |

An authentication error (exit 4) names the scope it needed and which token was
used.

## Raw REST calls the CLI does not wrap

```bash
TOKEN=$(azdo auth token --org myorg)    # token only on stdout; empty stdout on failure
```

Send a PAT as `Authorization: Basic base64(":<token>")` and an OAuth token as
`Authorization: Bearer <token>` (`azdo auth status --org myorg --json` tells you
which kind is stored). Never print the variable. `auth token` exits `1` when no
credential is stored, `3` when the org cannot be resolved, `4` when the
credential store is unavailable.

## Org and project resolution

For each command: `--org` / `--project` flags, then the Azure DevOps git
remote of the working directory, then the saved config.

```bash
azdo config list --json
azdo config set org myorg
azdo config set project myproject
azdo config set project otherproject --org otherorg   # per-org override
azdo config get project --org otherorg
```

Settings live in `~/.azdo/config.json`; credentials are never stored there.
`azdo config --help` lists every key.

## Diagnostics

- `azdo --trace ./trace.log <command>` appends a redacted HTTP trace.
- `azdo --no-update-check <command>` skips the newer-version check (it is
  already silent when output is piped).
