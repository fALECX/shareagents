#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import color from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { AGENTS, DEFAULT_HUB_DIR, HUB_FILE_NAME, AgentConfig } from './constants';
import { safeSyncFile, ensureDir, getInstructionsPreview, isSyncedToHub, ConflictResolution } from './sync';

const program = new Command();

program
    .name('shareagents')
    .description('Synchronize AGENTS.md-style AI agent instructions across different tools safely.')
    .version('1.0.0');

program
    .command('sync')
    .description('Interactively sync detected agent instructions files to the central hub')
    .action(async () => {
        p.intro(color.bgCyan(color.black(' ShareAgents AI Sync ')));

        p.note(
            `ShareAgents lets you keep one shared set of 'Agent Instructions' across your AI tools.\n` +
            `By syncing each tool's global instructions file into one central Hub, an edit in one place\n` +
            `(like Claude Code's CLAUDE.md) is reflected everywhere else it's linked.\n\n` +
            `${color.yellow(color.bold('Currently supported:'))} Claude Code, OpenCode, and Windsurf — the only tools with a\n` +
            `confirmed GLOBAL (not per-project) instructions file. Cursor, Codex, Gemini CLI, GitHub Copilot,\n` +
            `and Antigravity scope AGENTS.md to individual projects (or use a different convention entirely),\n` +
            `so they're intentionally left out rather than guessed at.\n\n` +
            `${color.yellow(color.bold('IMPORTANT:'))} Please close your AI tools before proceeding to prevent\n` +
            `'Permission Denied' errors while we move your instructions files.`,
            'What is ShareAgents?'
        );

        // 1. Where should the hub be?
        let hubDir = process.env.SHAREAGENTS_HUB_PATH;
        if (!hubDir) {
            hubDir = await p.text({
                message: 'Step 1: Where do you want your universal central folder (The Hub)?',
                placeholder: 'e.g. C:\\Users\\Name\\Documents\\AI-Agent-Instructions',
                initialValue: DEFAULT_HUB_DIR,
                validate: (value) => {
                    if (!value) return 'Please provide a path.';
                },
            }) as string;
        }

        if (p.isCancel(hubDir)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }

        const resolvedHubDir = path.resolve(hubDir);
        const hubFilePath = path.join(resolvedHubDir, HUB_FILE_NAME);

        if (!fs.existsSync(resolvedHubDir)) {
            p.log.info(`Creating a new central Hub directory at: ${color.dim(resolvedHubDir)}`);
            ensureDir(resolvedHubDir);
        }

        // 2. Detect agents
        p.log.step('Searching for installed AI agents on your system...');
        const homeDir = os.homedir();

        const detected: AgentConfig[] = [];
        const notDetected: AgentConfig[] = [];

        for (const agent of AGENTS) {
            const fullPath = path.join(homeDir, agent.relativePath);

            if (fs.existsSync(fullPath)) {
                detected.push({ ...agent, relativePath: fullPath });
            } else {
                notDetected.push({ ...agent, relativePath: fullPath });
            }
        }

        if (detected.length === 0) {
            p.log.warn('We couldn\'t find any supported agent instructions files in the default locations.');
        } else {
            p.log.success(`Detected valid files for: ${detected.map(d => color.green(d.name)).join(', ')}`);
        }

        if (notDetected.length > 0) {
            p.log.info(`Not found automatically: ${notDetected.map(n => color.gray(n.name)).join(', ')}`);
        }

        // 3. User selects what to sync
        const options = [
            {
                value: 'ALL',
                label: color.bold('Sync ALL detected agents'),
                hint: 'Connects all found tools to the shared central Hub'
            },
            ...detected.map(agent => ({
                value: agent.name,
                label: agent.name,
                hint: `Join the Hub & share instructions from ${agent.relativePath}`
            }))
        ];

        if (detected.length === 0) {
            const proceedManual = await p.confirm({
                message: 'No agents found. Would you like to manually specify an instructions file path?',
                initialValue: true
            });
            if (!proceedManual || p.isCancel(proceedManual)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }
        }

        let selectedAgents: AgentConfig[] = [];

        if (detected.length > 0) {
            const selectionResult = await p.multiselect({
                message: 'Which agents should join the shared Hub?',
                options,
                required: true,
            });

            if (p.isCancel(selectionResult)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }

            const results = selectionResult as string[];
            if (results.includes('ALL')) {
                selectedAgents = [...detected];
            } else {
                selectedAgents = detected.filter(a => results.includes(a.name));
            }
        }

        // 4. Add manual paths via interactive fallback
        let addMore = await p.confirm({
            message: 'Manual Sync: Do you have another instructions file you want to add to the Hub?',
            initialValue: false,
        });

        if (addMore && !p.isCancel(addMore)) {
            p.note(
                `Manual Sync allows you to provide the path to an instructions file for a tool we didn't\n` +
                `detect automatically. Point us to that single file (not a folder) and we'll link it to the Hub.`,
                'Manual Path Entry'
            );
        }

        while (addMore && !p.isCancel(addMore)) {
            const customName = await p.text({
                message: 'Name for this extra tool (e.g. "My Custom Agent"):',
                validate: (value) => { if (!value) return 'Required'; }
            });
            if (p.isCancel(customName)) break;

            const customPath = await p.text({
                message: `Absolute path to the instructions FILE for ${customName}:`,
                placeholder: 'e.g. C:\\Path\\To\\Tool\\AGENTS.md',
                validate: (value) => {
                    if (!value) return 'Required';
                    if (!fs.existsSync(value)) return 'This path does not exist on your computer.';
                    if (!fs.statSync(value).isFile()) return 'This path is a folder, not a file. ShareAgents syncs single files.';
                }
            });
            if (p.isCancel(customPath)) break;

            selectedAgents.push({ name: customName as string, relativePath: customPath as string });

            addMore = await p.confirm({
                message: 'Would you like to add another custom path?',
                initialValue: false,
            });
        }

        if (selectedAgents.length === 0) {
            p.outro('Nothing selected. Exiting.');
            return;
        }

        // 5. Preview content
        const previews = getInstructionsPreview(selectedAgents.map(a => ({ name: a.name, path: a.relativePath })));

        if (previews.length > 0) {
            p.note(
                previews.map(pv => `${color.cyan(color.bold(pv.name))}\n${color.dim(pv.preview)}`).join('\n\n'),
                `Current content of ${color.green(previews.length)} file(s) about to be shared:`
            );

            await p.confirm({
                message: `Reviewed the content above. Ready to continue?`,
                initialValue: true
            });
        }

        // 6. Resolve any content conflicts with the Hub up front (before the
        // spinner starts) - a single file can't be merged like a folder can, so
        // if the Hub already disagrees with an agent's file, the user has to pick.
        let simulatedHub: string | null = fs.existsSync(hubFilePath)
            ? fs.readFileSync(hubFilePath, 'utf-8')
            : null;

        const resolutions: Record<string, ConflictResolution> = {};
        const finalAgents: AgentConfig[] = [];

        for (const agent of selectedAgents) {
            if (isSyncedToHub(agent.relativePath, hubFilePath)) {
                finalAgents.push(agent);
                continue;
            }

            const content = fs.readFileSync(agent.relativePath, 'utf-8');

            if (simulatedHub === null || simulatedHub === content) {
                resolutions[agent.name] = 'use-mine';
                simulatedHub = content;
                finalAgents.push(agent);
                continue;
            }

            p.note(
                `${color.dim('--- Hub (current) ---')}\n${simulatedHub.slice(0, 240)}\n\n` +
                `${color.dim(`--- ${agent.name} (yours) ---`)}\n${content.slice(0, 240)}`,
                `Content conflict: ${agent.name}`
            );

            const choice = await p.select({
                message: `${agent.name}'s file differs from the Hub. How should we resolve this?`,
                options: [
                    { value: 'keep-hub', label: 'Keep the Hub version', hint: `${agent.name}'s current file is backed up, not lost` },
                    { value: 'use-mine', label: `Use ${agent.name}'s version`, hint: 'Overwrites the Hub (old Hub content is backed up)' },
                    { value: 'abort', label: `Skip ${agent.name} for now`, hint: 'Leave this tool untouched' },
                ],
            });

            if (p.isCancel(choice)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }

            const resolution = choice as ConflictResolution;
            resolutions[agent.name] = resolution;

            if (resolution === 'use-mine') {
                simulatedHub = content;
            }
            if (resolution !== 'abort') {
                finalAgents.push(agent);
            }
        }

        if (finalAgents.length === 0) {
            p.outro('Nothing left to sync after conflict resolution. Exiting.');
            return;
        }

        p.log.warn(color.yellow('Final Check: You are about to link these tools to the Hub:'));
        finalAgents.forEach(a => p.log.info(`- ${a.name}: ${color.dim(a.relativePath)}`));
        p.log.info(`Target Hub file: ${color.bgBlue(color.white(` ${hubFilePath} `))}`);

        const finalConfirm = await p.confirm({
            message: 'Proceed with synchronization? (Existing files will be backed up safely)',
            initialValue: true,
        });

        if (!finalConfirm || p.isCancel(finalConfirm)) {
            p.cancel('Sync aborted by user.');
            process.exit(0);
        }

        // 7. Execute sync
        const s = p.spinner();
        s.start('Synchronizing instructions...');

        for (const agent of finalAgents) {
            await safeSyncFile(agent.name, agent.relativePath, hubFilePath, resolutions[agent.name] ?? 'use-mine');
        }

        s.stop('Sync complete!');

        p.outro(color.green('All selected agents are now sharing the same instructions Hub!'));
    });

program.parse(process.argv);
