import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureDir, safeSyncFile, isSyncedToHub, getInstructionsPreview } from '../sync';

describe('sync logic', () => {
    const testDir = path.join(os.tmpdir(), 'shareagents-test-' + Date.now());
    const hubDir = path.join(testDir, 'hub');
    const hubFile = path.join(hubDir, 'AGENTS.md');
    const agentFile = path.join(testDir, 'agent-instructions.md');

    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        ensureDir(testDir);
        ensureDir(hubDir);
        fs.writeFileSync(agentFile, '# Hello from Agent\n');
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should ensure a directory exists', () => {
        const newDir = path.join(testDir, 'ensure-me');
        ensureDir(newDir);
        expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should sync a file to the hub and link it back', async () => {
        await safeSyncFile('TestAgent', agentFile, hubFile);

        expect(fs.existsSync(hubFile)).toBe(true);
        expect(fs.readFileSync(hubFile, 'utf-8')).toBe('# Hello from Agent\n');

        expect(isSyncedToHub(agentFile, hubFile)).toBe(true);
        expect(fs.readFileSync(agentFile, 'utf-8')).toBe('# Hello from Agent\n');

        const files = fs.readdirSync(testDir);
        const backupFile = files.find(f => f.startsWith('agent-instructions.md.backup_'));
        expect(backupFile).toBeDefined();
        expect(fs.readFileSync(path.join(testDir, backupFile!), 'utf-8')).toBe('# Hello from Agent\n');
    });

    it('should skip if already linked to the same hub', async () => {
        await safeSyncFile('TestAgent', agentFile, hubFile);
        const backupsAfterFirst = fs.readdirSync(testDir).filter(f => f.startsWith('agent-instructions.md.backup_'));

        await safeSyncFile('TestAgent', agentFile, hubFile);
        const backupsAfterSecond = fs.readdirSync(testDir).filter(f => f.startsWith('agent-instructions.md.backup_'));

        expect(backupsAfterSecond.length).toBe(backupsAfterFirst.length);
        expect(isSyncedToHub(agentFile, hubFile)).toBe(true);
    });

    it('backs up the old Hub content and adopts the agent\'s version when resolution is "use-mine"', async () => {
        fs.writeFileSync(hubFile, '# Existing Hub Content\n');

        await safeSyncFile('TestAgent', agentFile, hubFile, 'use-mine');

        expect(fs.readFileSync(hubFile, 'utf-8')).toBe('# Hello from Agent\n');

        const hubBackups = fs.readdirSync(hubDir).filter(f => f.startsWith('AGENTS.md.backup_'));
        expect(hubBackups).toHaveLength(1);
        expect(fs.readFileSync(path.join(hubDir, hubBackups[0]), 'utf-8')).toBe('# Existing Hub Content\n');
    });

    it('keeps the Hub content and backs up the agent\'s file when resolution is "keep-hub"', async () => {
        fs.writeFileSync(hubFile, '# Existing Hub Content\n');

        await safeSyncFile('TestAgent', agentFile, hubFile, 'keep-hub');

        expect(fs.readFileSync(hubFile, 'utf-8')).toBe('# Existing Hub Content\n');
        expect(fs.readdirSync(hubDir).filter(f => f.startsWith('AGENTS.md.backup_'))).toHaveLength(0);

        expect(isSyncedToHub(agentFile, hubFile)).toBe(true);
        expect(fs.readFileSync(agentFile, 'utf-8')).toBe('# Existing Hub Content\n');

        const files = fs.readdirSync(testDir);
        const backupFile = files.find(f => f.startsWith('agent-instructions.md.backup_'));
        expect(backupFile).toBeDefined();
        expect(fs.readFileSync(path.join(testDir, backupFile!), 'utf-8')).toBe('# Hello from Agent\n');
    });

    it('leaves both files untouched when resolution is "abort"', async () => {
        fs.writeFileSync(hubFile, '# Existing Hub Content\n');

        await safeSyncFile('TestAgent', agentFile, hubFile, 'abort');

        expect(fs.readFileSync(hubFile, 'utf-8')).toBe('# Existing Hub Content\n');
        expect(fs.readFileSync(agentFile, 'utf-8')).toBe('# Hello from Agent\n');
        expect(isSyncedToHub(agentFile, hubFile)).toBe(false);
    });

    it('produces a content preview for existing files', () => {
        const previews = getInstructionsPreview([{ name: 'TestAgent', path: agentFile }]);
        expect(previews).toHaveLength(1);
        expect(previews[0].name).toBe('TestAgent');
        expect(previews[0].preview).toContain('Hello from Agent');
    });

    it('skips non-existent files in getInstructionsPreview', () => {
        const missing = path.join(testDir, 'does-not-exist.md');
        const previews = getInstructionsPreview([{ name: 'Ghost', path: missing }]);
        expect(previews).toHaveLength(0);
    });

    it('returns "(empty file)" preview for a blank instructions file', () => {
        const emptyFile = path.join(testDir, 'empty.md');
        fs.writeFileSync(emptyFile, '');
        const previews = getInstructionsPreview([{ name: 'EmptyAgent', path: emptyFile }]);
        expect(previews).toHaveLength(1);
        expect(previews[0].preview).toBe('(empty file)');
    });

    it('isSyncedToHub returns false for a file that is not linked', () => {
        expect(isSyncedToHub(agentFile, hubFile)).toBe(false);
    });
});
