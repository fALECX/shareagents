import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AgentConfig {
  name: string;
  relativePath: string;
}

/**
 * Only agents with a CONFIRMED, global (home-directory-level, not per-project),
 * single dedicated instructions file are listed here. Cursor, Gemini CLI,
 * GitHub Copilot, and Antigravity are intentionally excluded: their AGENTS.md
 * conventions are either project-root scoped or use a different convention
 * entirely, and guessing a path would risk linking the wrong thing.
 *
 * Codex CLI reads `AGENTS.override.md` in its home dir (default `~/.codex`,
 * or `$CODEX_HOME`) if present, otherwise falls back to `AGENTS.md` - see
 * resolveCodexPath() below, which picks whichever of the two is actually
 * "live" so ShareAgents links the file Codex is really reading.
 */
export const AGENTS: AgentConfig[] = [
  { name: 'Claude Code', relativePath: '.claude/CLAUDE.md' },
  { name: 'OpenCode', relativePath: '.config/opencode/AGENTS.md' },
  { name: 'Windsurf', relativePath: '.codeium/windsurf/memories/global_rules.md' },
  { name: 'Codex CLI', relativePath: 'AGENTS.md' },
];

/**
 * Resolves the Codex CLI global instructions file, honoring $CODEX_HOME and
 * the override/base precedence: `AGENTS.override.md` wins if it exists,
 * otherwise `AGENTS.md` is used (created there if neither exists yet).
 */
export function resolveCodexPath(): string {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const overridePath = path.join(codexHome, 'AGENTS.override.md');
  const basePath = path.join(codexHome, 'AGENTS.md');
  return fs.existsSync(overridePath) ? overridePath : basePath;
}

export const DEFAULT_HUB_DIR = path.join(os.homedir(), 'Documents', 'AI-Agent-Instructions');
export const HUB_FILE_NAME = 'AGENTS.md';
