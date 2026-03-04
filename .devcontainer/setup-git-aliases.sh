#!/bin/bash
# Setup git aliases for the development container

echo "Setting up git aliases..."

# Log aliases
git config --global alias.logf 'log --graph --oneline --all --decorate'
git config --global alias.logr 'log --graph --oneline --decorate'

# Branch status alias
git config --global alias.bstatus '!f() { git log HEAD...origin/develop --oneline --left-right | awk '\''{ print substr($0, 1, 1)}'\'' | sort -n | uniq -c; }; f'

# Rebase and fetch aliases
git config --global alias.rod '!git fetch --prune && git rebase origin/develop'
git config --global alias.fpull '!git fetch --prune && git pull --rebase'
git config --global alias.rfi '!git rebase -i $(git merge-base HEAD origin/develop)'
git config --global alias.rc 'rebase --continue'

# Commit aliases
git config --global alias.amen '!git commit -a --amend -C HEAD'
git config --global alias.pamen '!git commit -a --amend -C HEAD && git push --force-with-lease'

# Push aliases
git config --global alias.pushf 'push --force-with-lease'
