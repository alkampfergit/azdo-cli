#!/bin/bash
# Post-creation setup script for the development container
set -e

echo "=========================================="
echo "Starting devcontainer post-creation setup"
echo "=========================================="

# Fix apt sources issue with yarn (copied from reference container)
echo "Cleaning up apt sources..."
sudo rm -f /etc/apt/sources.list.d/yarn.list

# Update apt and install utilities
echo "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y git-flow

# Setup git aliases
echo "Configuring git aliases..."
bash .devcontainer/setup-git-aliases.sh

# Install Claude Code CLI via official native installer (auto-updates)
# See: https://docs.anthropic.com/en/docs/claude-code/overview
echo "Installing Claude Code CLI..."
curl -fsSL https://claude.ai/install.sh | bash || true

# Install CLI tools that are distributed via npm
if command -v npm >/dev/null 2>&1; then
    echo "Installing OpenAI Codex..."
    npm install -g @openai/codex || true
else
    echo "npm not available, skipping npm-based CLI installs."
fi

# Install beads
echo "Installing beads..."
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/v0.49.6/scripts/install.sh | bash

# Install uv (Astral) and GitHub spec-kit via uv tool
# uv provides a universal version manager; we install via official script
if ! command -v uv >/dev/null 2>&1; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
else
    echo "uv already installed, skipping."
fi

# use uv to install github spec-kit command-line tool
if command -v uv >/dev/null 2>&1; then
    echo "Installing github spec-kit via uv..."
    uv tool install specify-cli --from git+https://github.com/github/spec-kit.git || true
else
    echo "uv not available, cannot install spec-kit."
fi

# Install keyring dependencies for integration tests (credential-store suite)
sudo apt-get install -y gnome-keyring libsecret-tools xvfb xdotool python3-dbus python3-gi

# Initialise the GNOME Keyring default collection so credential-store
# integration tests can run without a real desktop session (skipped if absent).
[[ -f scripts/setup-keyring.sh ]] && bash scripts/setup-keyring.sh || true

# tokensave: semantic code intelligence for Claude Code and Codex CLI.
echo "Installing tokensave..."
TOKENSAVE_TAG=$(curl -sI https://github.com/aovestdipaperino/tokensave/releases/latest | grep -i '^location:' | sed 's|.*/tag/||;s/\r//')
TOKENSAVE_VERSION="${TOKENSAVE_TAG#v}"
ARCH=$(uname -m)
if [[ "$ARCH" = "aarch64" ]] || [[ "$ARCH" = "arm64" ]]; then
    TOKENSAVE_ARCH="aarch64-linux"
else
    TOKENSAVE_ARCH="x86_64-linux"
fi
TOKENSAVE_URL="https://github.com/aovestdipaperino/tokensave/releases/download/${TOKENSAVE_TAG}/tokensave-${TOKENSAVE_TAG}-${TOKENSAVE_ARCH}.tar.gz"
echo "  Downloading tokensave ${TOKENSAVE_VERSION} (${TOKENSAVE_ARCH})..."
curl -sL "$TOKENSAVE_URL" -o /tmp/tokensave.tar.gz
tar xzf /tmp/tokensave.tar.gz -C /tmp
sudo mv /tmp/tokensave /usr/local/bin/tokensave
rm -f /tmp/tokensave.tar.gz
echo "  tokensave $(tokensave --version) installed."

echo "  Configuring tokensave for Claude Code..."
tokensave install --agent claude || true
echo "  Configuring tokensave for Codex CLI..."
tokensave install --agent codex || true
tokensave enable-upload-counter || true

echo "  Indexing repository..."
tokensave sync || true
echo "  tokensave setup complete."

# Install Homebrew and rtk.
append_if_missing() {
    local line="$1"
    local file="$2"

    touch "$file"
    if ! grep -Fqx "$line" "$file"; then
        echo "$line" >>"$file"
    fi
}

if ! command -v brew >/dev/null 2>&1; then
    echo "Installing Homebrew..."
    NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "Homebrew already installed, skipping."
fi

if [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
    BREW_BIN="/home/linuxbrew/.linuxbrew/bin/brew"
elif [[ -x /opt/homebrew/bin/brew ]]; then
    BREW_BIN="/opt/homebrew/bin/brew"
else
    BREW_BIN=""
fi

if [[ -n "$BREW_BIN" ]]; then
    BREW_SHELLENV_LINE="eval \"\$($BREW_BIN shellenv)\""
    append_if_missing "$BREW_SHELLENV_LINE" "$HOME/.zprofile"
    append_if_missing "$BREW_SHELLENV_LINE" "$HOME/.zshrc"
    append_if_missing "$BREW_SHELLENV_LINE" "$HOME/.bashrc"
    eval "$("$BREW_BIN" shellenv)"

    if brew list --formula rtk >/dev/null 2>&1; then
        echo "rtk already installed, skipping."
    else
        echo "Installing rtk via Homebrew..."
        brew install rtk
    fi

    echo "Configuring rtk for Claude Code..."
    rtk init --global --auto-patch || true
    echo "Configuring rtk for Codex CLI..."
    rtk init --global --codex --auto-patch || true
else
    echo "Homebrew install did not expose brew on a known path."
    exit 1
fi

# Expose .agents/skills/ to Claude Code by mirroring them under .claude/skills/
# (Claude Code's auto-discovery path). Idempotent.
echo "Linking skills into .claude/skills/..."
bash /workspaces/azdo-cli/scripts/link-skills.sh