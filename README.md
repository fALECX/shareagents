# ShareAgents CLI 🤖

Synchronize **AGENTS.md-style agent instructions** across different AI coding tools into one **Universal Central Hub**. Part of the [ShareSkills](https://github.com/) family of tools — same idea, same safety model, applied to your global agent instructions file instead of your skills folder.

## The Problem
Some AI tools read a global "instructions" file — Claude Code's `CLAUDE.md`, OpenCode's `AGENTS.md`, Windsurf's `global_rules.md` — that shapes how the agent behaves across every project. Edit it in one tool and the others don't know.

## The Solution
**ShareAgents** connects your tools' instructions files to a single shared file (The Hub). An edit in any linked tool is reflected in all the others.

## Why only 3 agents?
ShareAgents only supports tools with a **confirmed, global** (home-directory-level, not per-project) single instructions file: **Claude Code**, **OpenCode**, and **Windsurf**. Cursor, Codex CLI, Gemini CLI, GitHub Copilot, and Antigravity either scope their `AGENTS.md` to individual project repos or use an entirely different convention — syncing those would mean guessing at the wrong file, so they're deliberately left out rather than silently mishandled.

## Features
- 🔄 **One-Way Centralization:** Seeds the Hub from the first agent you sync, then keeps every linked tool pointed at it.
- 🔗 **Smart Linking:** Uses an NTFS hardlink on Windows (no admin/Developer Mode required) or a symlink on macOS/Linux.
- ⚖️ **Conflict-Aware:** A single file can't be merged like a folder can — if the Hub and a tool's file disagree, ShareAgents shows you both and asks which one should win, before touching anything.
- 🛡️ **Safety First:** Automatically backs up whatever gets replaced (both sides of a conflict) before making changes.
- 🛠️ **Manual Mode:** Add any custom instructions file path to the Hub.

## Installation

```bash
npm install -g shareagents
```

## Quick Start

1. **Close your AI tools** to prevent file access issues.
2. Run the sync command:
   ```bash
   shareagents sync
   ```
3. Follow the interactive prompts to:
   - Choose your Hub location (e.g., `Documents/AI-Agent-Instructions`).
   - Select which agents you want to synchronize.
   - Resolve any content conflicts it finds.
   - Add any custom paths.

## How it Works
1. ShareAgents finds your agents' global instructions files (e.g., `~/.claude/CLAUDE.md`).
2. If the Hub file doesn't exist yet, it seeds it from the first file you sync. If it does and disagrees with a tool's file, it asks you which one to keep.
3. It renames your original file to `<file>.backup_[timestamp]`.
4. It links the original location to the Hub file (hardlink on Windows, symlink on macOS/Linux).

## A known limitation
Some editors save files by writing a new copy and replacing the original ("atomic save") rather than editing in place. That silently breaks a hardlink or symlink on the next save, turning a "synced" file back into an independent copy with no error shown. ShareAgents checks link status on every run and will re-link and warn you if it finds a file has drifted — but if you edit a synced file directly, it's worth re-running `shareagents sync` afterward to confirm the link held.

## License
ISC
