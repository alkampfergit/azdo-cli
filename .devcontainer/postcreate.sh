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

# Install Claude Code CLI
if command -v npm >/dev/null 2>&1; then
    echo "Installing Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code || true
else
    echo "npm not available, skipping Claude Code CLI install."
fi

# Install beads
echo "Installing beads..."
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
