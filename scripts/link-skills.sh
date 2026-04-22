#!/usr/bin/env bash
# Link every skill under .agents/skills/ into .claude/skills/ so Claude Code
# auto-discovery picks them up. Idempotent — safe to re-run any time a new
# skill is added under .agents/skills/.
#
# Uses relative symlinks so the repository can be relocated without breakage.

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/.agents/skills"
DEST_DIR="$REPO_ROOT/.claude/skills"

if [ ! -d "$SRC_DIR" ]; then
    echo "link-skills: $SRC_DIR does not exist; nothing to link."
    exit 0
fi

mkdir -p "$DEST_DIR"

linked=0
skipped=0
for skill_path in "$SRC_DIR"/*/; do
    skill_name="$(basename "$skill_path")"
    dest="$DEST_DIR/$skill_name"
    rel_target="../../.agents/skills/$skill_name"

    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
        echo "link-skills: $dest exists and is not a symlink; leaving it alone."
        skipped=$((skipped + 1))
        continue
    fi

    ln -sfn "$rel_target" "$dest"
    linked=$((linked + 1))
done

pruned=0
for link in "$DEST_DIR"/*; do
    [ -L "$link" ] || continue
    if [ ! -e "$link" ]; then
        rm "$link"
        pruned=$((pruned + 1))
    fi
done

echo "link-skills: linked $linked, skipped $skipped (non-symlink dest), pruned $pruned stale."
