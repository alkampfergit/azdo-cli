# How this project’s automation works

This guide explains the checked-in development environment and issue automation,
then gives safe operating guidance for using the project from a VM or Hermes.
Deployment-specific VM details are called out as unknown where they are not
specified by the repository; they must be confirmed with the VM operator.

## At a glance

```text
Devcontainer lifecycle
  postCreateCommand -> install agent tools, Automata CLI, Spec Kit, skills
  postStartCommand  -> install/start cron and register the Automata runner

Cron (every 5 minutes)
  -> automata do-work --silent
  -> Automata reads .automata/config.json
  -> discover open GitHub issues labelled "automated"
  -> use the configured prompts and repository skills to process work

Spec Kit workflow
  speckit-full -> discover labeled issues and coordinate one work cycle
  speckit-gh   -> drive one issue through spec, plan, tasks, PR, CI, review
  approval gates -> issue/PR conversation with an authorized owner
```

The diagram describes the checked-in devcontainer setup. It does not establish
how Hermes provisions the VM, starts the agent, or schedules work there.

## 1. Devcontainer setup

The configuration is in `.devcontainer/devcontainer.json`:

- The container uses the TypeScript Node devcontainer image and adds tools
  including GitHub CLI and Azure CLI.
- `postCreateCommand` runs `.devcontainer/postcreate.sh` when the container is
  created. That script installs Automata CLI, the Spec Kit CLI (`specify-cli`),
  GitHub CLI-adjacent tooling, and other developer tools. It also configures
  tokensave and links the repository skills for Claude Code.
- `postStartCommand` runs `.devcontainer/start-do-work-cron.sh` whenever the
  container starts.

The post-create script is setup automation, not a general VM installer. It
contains Linux/devcontainer-specific package setup and assumes the checkout is
at `/workspaces/azdo-cli` in several places.

## 2. Automata and the local cron job

The checked-in cron entry is `.devcontainer/automata-do-work.cron`. It runs
every five minutes as the `node` user and appends output to
`~/.local/state/automata-do-work/cron.log` (the cron file currently spells
this out as `/home/node/...`).

`.devcontainer/start-do-work-cron.sh` installs that entry under
`/etc/cron.d/automata-do-work`, installs the runner at
`/usr/local/bin/automata-do-work-cron`, creates a private state directory, and
starts cron if it is not already running. The runner changes to
`/workspaces/azdo-cli` and invokes `automata do-work --silent` in a login shell
so the user's CLI paths are available.

`.automata/config.json` configures Automata to discover GitHub issues by the
`automated` label. It names the system prompt and the issue discussion and PR
work prompts under `.automata/`, limits a tick to two runs, sets `develop` as
the work base branch and `master` as the trunk branch, and lists the allowed
GitHub users. The prompts direct Automata to use the repository skills.

### What one Automata tick does

The scheduled runner starts `automata do-work --silent` from the repository
root in a login shell. Automata loads `.automata/config.json`, checks GitHub for
eligible work, and uses the configured prompt for the type of work selected.
The current configuration uses the `automated` issue label and allows at most
two runs per tick; this is a cap, not a promise that two tasks will run.

- **Issue discussion:** the discussion prompt treats messages marked `NEW` as
  the actionable turn and earlier messages as context. It is discussion-only
  unless a `NEW` message explicitly requests implementation; otherwise it must
  not modify files, create a branch, or open a PR. For implementation requests,
  it directs the agent to the repository's `speckit-full` skill and spec-driven
  process, and to document the change in the appropriate docs page.
- **PR work:** the PR prompt expects the task branch to already be checked out.
  It directs the agent to address new messages and unresolved review threads,
  follow the TypeScript/test/documentation conventions, run the prescribed
  checks, commit and push to that branch, and not merge or push to the base
  branch.

The configured system prompt also routes work through `speckit-full`. The
checked-in skills define the issue workflow and its approval gates; the skill
files, prompts, and Automata configuration are distinct inputs, so installing a
skill alone does not install the scheduler. User allow-lists and service-account
identities are configured in `.automata/config.json`; this guide intentionally
does not reproduce account names or credential material.

The cron output is appended to `/home/node/.local/state/automata-do-work/cron.log`.
That file is a scheduler/command log; it is not necessarily a full agent
transcript. Before retrying a failed or apparently stuck tick, inspect the
current branch, worktree, log, and any active Automata lock/process to avoid
starting overlapping work or disrupting a branch in progress. Use the
installed Automata version's `automata do-work --help` for supported
read-only diagnostics; do not assume every version exposes the same flags.

To inspect the local scheduler in the devcontainer, check the installed cron
entry and the log path above. A manual one-shot invocation from the repository
root is:

```bash
automata do-work --silent
```

Use the Automata CLI's own help for supported diagnostic or configuration
commands; this guide only records commands present in this repository's
scripts.

## 3. GitHub Spec Kit skills

The skills are checked in under `.agents/skills/`:

- `speckit-full` is the label-driven coordinator. It finds eligible issues and
  delegates each implementation flow to `speckit-gh`.
- `speckit-gh` handles one issue end to end: it claims the issue, prepares the
  spec, clarification, plan and tasks, opens a draft PR, implements and
  validates the change, then follows CI and review.
- The workflow uses explicit owner approval gates at the documented spec and
  planning stages. Approval and progress are communicated on the GitHub issue
  or PR, according to the skill protocol.

The skills also describe `once`, in-session `loop`, and durable `cron` modes.
Those are skill/runtime scheduling modes. The repo's five-minute devcontainer
cron is a separate mechanism: it launches Automata's `do-work` command, which
uses `.automata/config.json` and the configured prompts. Do not assume the
`speckit-full` `/schedule` mode is what installs or manages the local cron job.

## 4. Running the project from a VM

The recommended layout in this guide is to run Hermes and Docker on a Linux VM,
keep the repository checkout on that VM, and open the checkout inside its Dev
Container. Confirm this matches the actual deployment before following the
setup steps below; this repository does not define a VM provider or image.

### Create the VM and start the Dev Container

1. Create a Linux VM with SSH access (on Proxmox, see §7; for agent SSH
   access, see §6). Install and start Docker Engine on the VM, and make sure
   the account that will run Hermes can use Docker.
2. Install Hermes for that account and complete its setup so it can use a
   model and run terminal commands:

   ```bash
   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
   hermes setup
   ```

   Keep GitHub credentials in the account's credential helper or approved
   secret store; do not put them in prompts or repository files.
3. In a Hermes terminal session on the VM, clone the repository. If it is
   private, authenticate that VM account with GitHub first:

   ```bash
   mkdir -p "$HOME/src"
   git clone https://github.com/alkampfergit/azdo-cli.git "$HOME/src/azdo-cli"
   ```

4. Install Node.js/npm on the VM host, then install the Dev Container CLI and
   create/start the project's container:

   ```bash
   npm install -g @devcontainers/cli
   devcontainer up --workspace-folder "$HOME/src/azdo-cli"
   ```

   The post-create setup runs when needed; the post-start hook is intended to
   install the cron entry and start cron. Verify the live hook effects in the
   container before treating the scheduler as enabled. The repository scripts
   expect the container workspace at `/workspaces/azdo-cli` and its configured
   `node` user. The host checkout can live at `$HOME/src/azdo-cli` because it is
   mounted into that workspace. When healthy, the cron checks GitHub every five
   minutes for issues labeled `automated`. Confirm the container-side GitHub
   authentication and `.automata/config.json` before leaving it running.

### Day-to-day Dev Container workflow

The VM host owns Docker and the checkout. The Dev Container supplies the
project's toolchain and configured user/shell; any credentials must be set up
separately inside it. The Automata cron runs there too. Start at the host
checkout path, but run project commands inside the container.

#### 1. Start or reuse the project container

```bash
cd "$HOME/src/azdo-cli"
devcontainer read-configuration --workspace-folder "$PWD"
devcontainer up --workspace-folder "$PWD"
```

Read the configuration before starting. `devcontainer up` may create the
container or reuse/start an existing one; keep the returned container ID for
later lifecycle actions. Do not assume that reusing an already-running
container replays lifecycle hooks. If startup times out, check whether its
container or setup process is still active before retrying—do not launch a
second setup against the same workspace.

#### 2. Verify the command environment before working

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" -- \
  zsh -lic 'whoami && pwd && node --version && npm --version && git status --short --branch'
```

The command runs as the configured `remoteUser` (`node`) in the container's
workspace path (currently `/workspaces/azdo-cli`), not the VM's `$HOME/src`
path. `devcontainer exec` exits with the command's status; treat non-zero as a
failed probe. For a long interactive session, open a shell with:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -l
```

If a tool is missing, verify it inside the container before installing it; a
host-side `command -v`, package version, or authentication result says nothing
about container state. If the project's dependencies are absent, install them
from the lockfile inside the container:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'npm ci'
```

#### 3. Edit files and run project commands

The repository is bind-mounted: edits made in the VM checkout are visible in
the container and vice versa. Keep Git and project-tool commands inside the
container so they use the configured runtime and dependencies. For example:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'git status --short --branch'
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'npm run test:unit'
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'npm test && npm run lint'
```

Use `npm run test:unit` for the unit-focused suite. The repository's full test
and lint gate is `npm test && npm run lint` (see `AGENTS.md`). Integration
tests may need the separately provisioned environment described in
`docs/development.md`; do not place credentials in the checkout or print them
to logs. For source CLI verification, distinguish a locally built entrypoint
from a globally installed CLI:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'npm run build && node dist/index.js --version && node dist/index.js --help'
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'command -v azdo && azdo --version'
```

The first command tests the build output in this checkout; the second tests
whatever `azdo` executable is on the container's `PATH`. One does not prove
the other is installed or current.

#### 4. Check authentication in the environment that uses it

The cron runner executes inside the container, so check its GitHub CLI login
there:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'gh auth status'
```

If authentication is absent, open an interactive shell in the container so you
can complete the login prompts. At the resulting shell prompt, run:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

If Git operations need to reuse GitHub CLI credentials, configure that inside
the same container and verify it with a read-only remote lookup:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'gh auth setup-git && git ls-remote origin HEAD'
```

Do not paste tokens into the guide, shell history, prompts, or logs. If the Dev
Container is recreated, its local home and authentication may be lost unless
explicitly persisted, so re-check them.

#### 5. Verify the Automata cron hook after startup

The configured `postStartCommand` installs the cron entry and starts cron, but
verify its effects in the live container every time it is started or rebuilt:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic \
  'whoami && pgrep -a -x cron && test -f /etc/cron.d/automata-do-work && test -x /usr/local/bin/automata-do-work-cron && test -d /home/node/.local/state/automata-do-work'
```

A cron file alone does not prove the daemon is running. If the entry, runner,
or daemon is missing after startup, run the repository's idempotent start hook
inside the container, then repeat these checks:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'bash .devcontainer/start-do-work-cron.sh'
```

The scheduled runner fires every five minutes as `node` and appends to
`/home/node/.local/state/automata-do-work/cron.log`. Wait at least one schedule
interval after startup, then verify that the log exists and has a recent
modification time:

```bash
devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'stat /home/node/.local/state/automata-do-work/cron.log'
```

Inspect the log locally, redacting any sensitive output before sharing it.
Before manually retrying a failed or stuck tick, inspect the cron log, worktree,
active Automata lock, and processes; do not start a second tick while another
may be working. Check `automata do-work --help` inside the container before
using diagnostic flags, since supported options vary by installed version. A
successful `--check` or dry-run is only a health/selection result; it is not
proof that a real scheduled tick completed. Verify a fresh log-producing tick
and its result before reporting the scheduler operational.

#### 6. Use VS Code or Hermes against the same checkout

- **VS Code:** connect to the VM with Remote SSH, open
  `/home/<vm-user>/src/azdo-cli`, then run **Dev Containers: Reopen in
  Container**. Terminals and extensions use the container environment.
- **Hermes or an SSH terminal:** tell the agent to edit the VM-mounted checkout
  and use `devcontainer exec --workspace-folder "$HOME/src/azdo-cli" ...` for
  project commands, tests, GitHub authentication, and Automata checks. This
  makes the execution boundary explicit rather than accidentally using host
  tools or credentials.
- **Claude Code or Codex CLI:** verify the executable and its authentication
  from inside the container before use. Launch it in the attached interactive
  terminal so prompts and approvals are visible; for example:

  ```bash
  devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'claude --version && claude auth status'
  devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'codex --version && codex login status'
  devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'claude'
  ```

  For long-running agent work, keep the terminal/process handle and monitor it.
  If a wrapper times out, inspect the in-container process tree and Git status
  before retrying; the agent may still be running and editing the shared tree.
- **After a VM reboot:** run `devcontainer up` again, then repeat the identity,
  authentication, and cron-hook checks above. Confirm the expected entry, live
  cron process, runner executable, and a recent successful tick; do not infer
  scheduler health from the startup command's presence alone.

#### 7. Stop or remove the container safely

Do not stop the container while Automata or another task is active. Check the
cron process and Automata lock/task processes first. To stop it but preserve the
container for a later restart, use the exact container ID returned by
`devcontainer up`. If that ID was not saved, identify the container by this
repository's workspace label and confirm the matching path before using its ID:

```bash
docker ps --all --filter "label=devcontainer.local_folder=$(realpath "$HOME/src/azdo-cli")"
```

Then stop it but keep it for a later restart:

```bash
docker stop <container-id>
```

To remove a container (which loses container-local state such as unpersisted
credentials and installed tools), only when removal is intended:

```bash
docker rm -f <container-id>
```

The bind-mounted VM checkout remains on disk, but a recreated container may
need its tools and authentication set up again. The npm Dev Container CLI does
not provide `stop`/`down` commands; manage the exact container with Docker.

The host and container are separate environments. Host authentication is not
automatically available inside the container. Authenticate and verify from the
environment that will run the GitHub operation.

Hermes setup, VM creation, SSH access, and Docker installation depend on the
VM provider and are not configured by this repository.

Before enabling any schedule, confirm with the VM operator which VM and Hermes
profile own the checkout, the VM account and checkout path, where GitHub
authentication is provisioned, and which scheduler is authoritative. Check
`gh auth status` inside the environment that will run the GitHub operation; host
authentication is not automatically available in the container. Do not infer
deployment-specific settings from `.devcontainer/devcontainer.json`.

### Select exactly one scheduler

The repository currently defines a five-minute cron job **inside the Dev
Container**. It is not automatically installed on a VM host. Check the actual
runtime for the active scheduler before enabling another one:

- Dev Container: inspect `/etc/cron.d/automata-do-work`, the cron process,
  `/usr/local/bin/automata-do-work-cron`, and
  `~/.local/state/automata-do-work/cron.log` inside that container.
- Hermes-managed schedule: inspect the Hermes cron job list/status and its
  latest run result (see §5).
- VM host or another scheduler: use the owning platform's documented controls;
  its commands are intentionally not guessed here.

Do not run the Dev Container cron, a VM-host cron, and a Hermes cron for the
same `automata do-work` workflow at once. If changing scheduler, first verify
the old schedule is paused/stopped, then configure and test the new one, and
read back its state and a real run result before calling it active.

## 5. Hermes instructions

Hermes cron is a separate scheduler managed by the Hermes gateway; it is not
the same as the Dev Container's system cron or Automata's `do-work` command.
The active Hermes profile/gateway must be running for its scheduled jobs to
fire. Hermes cron tasks run in fresh sessions, so put the correct checkout in
the job's `workdir` and make the prompt self-contained; otherwise repository
instructions such as `AGENTS.md` may not be loaded.

Useful CLI operations (check `hermes cron --help` on the installed version):

```bash
hermes cron list
hermes cron status
hermes cron run <job_id>       # request an immediate run
hermes cron pause <job_id>     # pause, retaining the job
hermes cron resume <job_id>
hermes cron remove <job_id>    # remove the job
```

Example syntax only—use it only after confirming Hermes is the sole scheduler
for this task and replacing the absolute path with the verified checkout:

```bash
hermes cron create "every 1h" "Inspect the repository status and report any actionable issues; do not modify files or push." --workdir /absolute/path/to/azdo-cli --name "azdo-cli status check"
```

The `workdir` must exist and be absolute. Without it, a scheduled job may run
outside this repository and will not load its `AGENTS.md` instructions.

For a Hermes-managed project schedule:

1. List jobs and confirm there is no existing job for this repository/workflow.
2. Create or change a job only after choosing it as the sole scheduler. Set its
   working directory to the verified checkout and make its instructions name
   the intended repository, allowed operation, and reporting destination.
3. Test one run, then list/read the job again and inspect its last status/output.
   A saved job definition alone does not prove the gateway ran it successfully.
4. Pause the job before maintenance; resume only after checking the checkout,
   credentials, and intended branch. Remove it only when the schedule is no
   longer wanted.

Hermes supports agent-backed jobs and script-only (`no-agent`) jobs; choose
based on whether the task needs reasoning. Use script-only only for a tested,
self-contained script. Do not make a Hermes job launch `automata do-work` while
the Dev Container cron is still active, since both can process the same work.

The repository does not specify which Hermes profile, gateway host, VM backend,
VM account, or Hermes job ID is used for this project. Obtain those from the
VM operator before managing the production schedule. Use `hermes --help` and
`hermes cron --help` on the installed version to confirm supported commands.

## 6. Giving an agent SSH access without sharing a password

Use this when an agent (Hermes, Claude Code, Codex) must run commands on a
Proxmox host or a VM that only accepts password authentication. Placeholders
such as `<host>` and `<user>` stand for your own values.

### The problem

An agent's shell has no TTY. `ssh` reads passwords from `/dev/tty`, so the
prompt receives an empty string and fails immediately. It looks like a wrong
password, but the agent never had a chance to supply one. The usual workarounds
are worse:

| Option | Why not |
|---|---|
| Paste the password in chat | It stays in the transcript and logs |
| `sshpass -p` or `expect` | The secret must be readable by the agent and shows in `ps` |
| Install a key first | Right end state, but installing it needs a shell |

### Technique: one authenticated socket, shared

OpenSSH can expose an authenticated connection as a file (a control socket).
You authenticate once in a real terminal; the agent reuses that connection and
never sees a credential.

```bash
# YOU, once, in a real terminal (-f backgrounds after the password prompt)
mkdir -p ~/.ssh/cm && chmod 700 ~/.ssh/cm
/usr/bin/ssh -M -N -f -S ~/.ssh/cm/<name> -o ControlPersist=8h <user>@<host>

# THE AGENT, as often as needed
/usr/bin/ssh -o BatchMode=yes -S ~/.ssh/cm/<name> <user>@<host> '<command>'

# YOU, to check or revoke
/usr/bin/ssh -O check -S ~/.ssh/cm/<name> <user>@<host>
/usr/bin/ssh -O exit  -S ~/.ssh/cm/<name> <user>@<host>
```

- `-M` makes this connection the master, `-S` is the socket path, `-N` runs no
  command, and `-f` backgrounds it after authentication.
- `ControlPersist=8h` ends access on its own after the last use plus 8 hours.
- `BatchMode=yes` makes a dead socket fail at once instead of prompting.

### Revocation and limits

- **Instant:** `-O exit` closes the master, and the agent's next command fails.
  Deleting the socket file is not revocation, because the master keeps running.
- **Unilateral:** the agent cannot reconnect, because it holds no password.
- **Natural boundary:** commands that need a TTY (`qm terminal`, `htop`,
  interactive logins) are refused. The agent should report the gap, not guess.
- **It removes the credential, not the authority.** If the master connected as
  root, the agent is root. Prefer a narrower account.
- **Any process running as your user can use the socket** (mode 0600), which is
  the same trust boundary as your private key.
- **The socket outlives the chat session.** Ending the conversation does not
  close it.
- **Gotchas:** remove a stale socket with `rm -f` and reopen it. `MaxSessions`
  defaults to 10, which matters for parallel bursts. Not every SSH server
  supports multiplexing, so verify. On macOS use `/usr/bin/ssh`, because
  Homebrew's `ssh` can be blocked from the LAN by Local Network privacy and
  fails with a misleading `No route to host`.

### It is a bootstrap, not a destination

| Situation | Better tool |
|---|---|
| Ongoing automation | Dedicated keypair, `authorized_keys` with `restrict,from=...,command=...` |
| Untrusted agent | A bastion with session recording and a scoped account |
| One-off admin with an agent | This technique |
| Password-only host | This technique, then install a key |

For a VM you create yourself, use a key from the start: generate a per-VM key
(`ssh-keygen -t ed25519 -f ~/.ssh/<vm>_ed25519 -N "" -C <vm>`) and put the
public key in the cloud-init user-data. It authorizes nothing else.

Handle secrets by file, not by chat:

- Never type a password to the agent. Generate any password hash locally and
  supply only the hash.
- Make a cloud-init snippet that contains a hash mode `0600`; a world-readable
  hash can be cracked offline.
- Let the human write secrets into files. The agent should only verify their
  shape and never print values.

## 7. Preparing a Proxmox VM for Hermes

Hermes is a Python agent that talks to a chat platform (Slack here) and drives
devcontainers. Node is needed only for the devcontainer CLI and the model CLI,
not for Hermes itself. This section describes one proven layout; adapt names,
sizes and versions to your environment.

### 1. VM and base OS

Create the VM from a Debian cloud image with cloud-init. A workable sizing is
4 cores, 6-7 GB RAM with ballooning, and a 200 GB thin-provisioned disk with
`discard=on`. Enable the QEMU guest agent (`--agent enabled=1`) and a serial
console (`--vga serial0`). Use cloud-init to set the user, the SSH public key
and Docker. Expect Docker Engine and Compose to be present afterwards.

### 2. Toolchain (as the admin user)

| Step | Detail |
|---|---|
| Node LTS | Resolve the version from `nodejs.org/dist/index.json`, download the tarball, verify it with `sha256sum -c SHASUMS256.txt` (keep the upstream filename), then untar into `/usr/local` |
| devcontainer CLI | `npm install -g @devcontainers/cli` |
| Model CLI | For example `npm install -g @openai/codex`, if Hermes drives Codex |
| Smoke test | Run `devcontainer up` on a sample repo and prove the bind mount writes through to the host |
| ripgrep | `apt install ripgrep` (Hermes warns without it) |
| Disk hygiene | A systemd timer (weekly, `Persistent=true`) running `docker system prune -af --filter until=336h` and `docker volume prune -f`. Set it up before Hermes, or the disk fills silently |

### 3. Service account

```bash
useradd -r -m -d /srv/hermes -s /bin/bash hermes
usermod -aG docker hermes          # needed for devcontainers
chmod 0700 /srv/hermes             # it will hold live OAuth tokens
chown -R hermes:hermes /srv/work   # workspace for checkouts
passwd -S hermes                   # should show L (locked): no password login
install -d -m 0750 -o root -g hermes /etc/hermes
```

Run commands as that account with `sudo -u hermes -H ...`. Membership of the
`docker` group is effectively root on the VM; accept that trade-off knowingly.

### 4. Model login (needs a human)

- If the provider uses device-code login (for example Codex with a ChatGPT
  account), enable it in the account's security settings first. It may be off
  by default and the resulting error is unhelpful.
- Run `sudo -u hermes -H codex login --device-auth` and approve the code in a
  browser.
- Fallback: an SSH tunnel (`-L 1455:localhost:1455`), then `codex login`.

### 5. Install Hermes (as the service account)

- Download and read the installer; do not `curl | bash` it. Upload the reviewed
  copy to the VM and verify it by checksum.
- Run it as the service account, from a directory that account owns:

  ```bash
  sudo -u hermes -H bash -c "cd /srv/hermes && bash /tmp/hermes-install.sh --skip-setup"
  ```

  Running it from another user's mode-0700 home failed, because `uv` probes the
  current directory for a `.venv`. That was a working-directory problem, not a
  corrupt install.
- Configuration lives in `~/.hermes/config.yaml`. Secrets live in
  `~/.hermes/.env`, written by `hermes setup`. Do not hand-write a systemd unit
  or env file.

### 6. Chat app (human steps)

- Generate the Slack manifest on the VM; Hermes can emit one for its own
  version.
- In the Slack app console, create the app from that manifest and collect the
  app-level token (`connections:write`), the bot token and the signing secret.
- Create a private control channel, invite the bot, and note the channel ID and
  the allowed member IDs.
- Enter secrets with `hermes setup gateway`. Never paste them into chat.

### 7. Run Hermes as a system service

```bash
sudo hermes gateway install --system --run-as-user hermes --start-on-login --start-now
hermes gateway status
journalctl -u hermes-gateway -f
```

- **Why `--system`:** without it Hermes installs a systemd `--user` unit, which
  fails for a service account with no login session ("Failed to connect to user
  scope bus"). The alternative is `loginctl enable-linger hermes`.
- To read the journal without `sudo`, add your user to the `systemd-journal`
  group.
- A wrapper at `/usr/local/bin/hermes` may run `sudo -u hermes` for normal users
  and set `HERMES_HOME` for root.
- **End-to-end proof:** `hermes -z "Reply with exactly: MODEL_OK"` should return
  `MODEL_OK`, and a real chat message should produce a reply in the journal.

### 8. Security posture

- **Anyone who can message the bot can cause code execution on the VM.** A
  `devcontainer.json` in a repository is arbitrary code by design. The gates
  are the allowed-user list and the home channel; add a repository or
  organization allowlist if you can.
- **Isolate the network.** Prefer an isolated bridge with outbound-only access
  and an egress allowlist, and verify every required host is reachable. Do not
  dual-home the VM as an isolation toggle.
- **Keep a console escape hatch** (`qm terminal`, serial). A locked account
  makes the console unusable, so keep a console login path available.
- **Back up the VM** (for example a Proxmox Backup Server job) and set
  `prune-backups`; `keep-all` eventually fills the disk.

### Known quirks

- Duplicate chat replies may appear; a logged warning points to a known
  upstream issue.
- Warnings about optional plugins without credentials are harmless.
- `codex exec` blocks on stdin. Close it or redirect `</dev/null`.

## Source files

- `.devcontainer/devcontainer.json`
- `.devcontainer/postcreate.sh`
- `.devcontainer/start-do-work-cron.sh`
- `.devcontainer/automata-do-work.cron`
- `.devcontainer/run-do-work-cron.sh`
- `.automata/config.json` and the prompts in `.automata/`
- `.agents/skills/speckit-full/SKILL.md`
- `.agents/skills/speckit-gh/SKILL.md`
