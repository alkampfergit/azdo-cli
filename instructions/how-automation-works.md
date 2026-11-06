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

The repository provides the Dev Container configuration, but not a
provider-specific VM image or VM lifecycle commands. The usual arrangement is
to run Hermes and Docker on a Linux VM, keep the repository checkout on that
VM, and open the checkout inside its Dev Container.

### Create the VM and start the Dev Container

1. Create a Linux VM with SSH access. Install and start Docker Engine on the
   VM, and make sure the account that will run Hermes can use Docker.
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

   This reads `.devcontainer/devcontainer.json`, runs the post-create setup
   when needed, and runs the cron startup command when the container starts.
   The repository scripts expect the container workspace at
   `/workspaces/azdo-cli` and its configured `node` user. The host checkout can
   live at `$HOME/src/azdo-cli` because it is mounted into that workspace.
   Starting the container also enables the Automata cron job, which checks
   GitHub every five minutes for issues labeled `automated`. Confirm the
   credentials and `.automata/config.json` before leaving it running.

### Work in the Dev Container

- **With VS Code:** install the Remote SSH and Dev Containers extensions on
  your workstation, connect to the VM using Remote SSH, and open
  `/home/<vm-user>/src/azdo-cli`. Run **Dev Containers: Reopen in Container**
  from the Command Palette. The terminal and extensions then work in the
  container.
- **From Hermes or an SSH terminal:** run repository commands through the
  Dev Container CLI so they use the project's configured toolchain:

  ```bash
  devcontainer exec --workspace-folder "$HOME/src/azdo-cli" zsh -lic 'npm test'
  ```

  Tell Hermes to use the VM checkout for file changes and `devcontainer exec`
  for commands that need the project environment. The checkout is shared with
  the container, so edits made through either view appear in both.
- **After a VM reboot:** start the container again with
  `devcontainer up --workspace-folder "$HOME/src/azdo-cli"`. Its `postStartCommand`
  starts the container's cron service. Check the active scheduler before
  enabling any additional Hermes schedule.

The host and container are separate environments. Host authentication is not
automatically available inside the container. Check `gh auth status` in the
environment that will run the GitHub operation, and authenticate there if
needed.

Hermes setup, VM creation, SSH access, and Docker installation depend on the
VM provider and are not configured by this repository.

### Identify the environment before operating it

Open the terminal/session that Hermes has attached to the intended VM, then
confirm where you are and which identity/environment is active:

```bash
hostname
id
pwd
cd /path/to/checkout
git status --short --branch
command -v automata && automata --version
gh auth status
```

Run the Git and Automata checks from the actual checkout. Confirm the current
branch and a clean worktree before any scheduled or write operation. If the
checkout is inside a Dev Container, use its configured lifecycle and paths; if
it is directly on the VM, install/configure the required tools for that VM
account rather than assuming `.devcontainer/postcreate.sh` has run. Never copy
credentials into the repository: authenticate in the environment that runs the
job and follow the platform's approved secret mechanism.

Before enabling automation, establish all of the following with the VM
operator: VM owner/provider and lifecycle controls; checkout path and Linux
account; whether Hermes enters the VM directly or through a Dev Container;
where GitHub credentials are provisioned; and which scheduler is authoritative.
This repository does not contain those deployment-specific facts, so do not
infer them from `.devcontainer/devcontainer.json`.

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

## Source files

- `.devcontainer/devcontainer.json`
- `.devcontainer/postcreate.sh`
- `.devcontainer/start-do-work-cron.sh`
- `.devcontainer/automata-do-work.cron`
- `.devcontainer/run-do-work-cron.sh`
- `.automata/config.json` and the prompts in `.automata/`
- `.agents/skills/speckit-full/SKILL.md`
- `.agents/skills/speckit-gh/SKILL.md`
