import path from 'path';
import os from 'os';

export interface AgentConfig {
  name: string;
  relativePath: string;
}

/**
 * Only agents with a CONFIRMED, global (home-directory-level, not per-project),
 * single dedicated instructions file are listed here. Cursor, Codex, Gemini CLI,
 * GitHub Copilot, and Antigravity are intentionally excluded: their AGENTS.md
 * conventions are either project-root scoped or use a different convention
 * entirely, and guessing a path would risk linking the wrong thing.
 */
export const AGENTS: AgentConfig[] = [
  { name: 'Claude Code', relativePath: '.claude/CLAUDE.md' },
  { name: 'OpenCode', relativePath: '.config/opencode/AGENTS.md' },
  { name: 'Windsurf', relativePath: '.codeium/windsurf/memories/global_rules.md' },
];

export const DEFAULT_HUB_DIR = path.join(os.homedir(), 'Documents', 'AI-Agent-Instructions');
export const HUB_FILE_NAME = 'AGENTS.md';
