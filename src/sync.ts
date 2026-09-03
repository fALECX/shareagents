import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import color from 'picocolors';

export type ConflictResolution = 'keep-hub' | 'use-mine' | 'abort';
export type LinkMethod = 'hardlink' | 'symlink' | 'copy';

/**
 * Ensures the destination directory exists.
 */
export function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Links the Hub file into originalPath using the strongest mechanism available
 * without requiring elevation:
 *  - Windows: NTFS hardlink first (no admin/Developer Mode needed), falling back
 *    to a file symlink, then to a plain copy as a last resort.
 *  - macOS/Linux: a regular file symlink (no elevation needed there).
 */
function linkFile(hubFile: string, originalPath: string): LinkMethod {
    ensureDir(path.dirname(originalPath));

    if (process.platform === 'win32') {
        try {
            fs.linkSync(hubFile, originalPath);
            return 'hardlink';
        } catch {
            try {
                fs.symlinkSync(hubFile, originalPath, 'file');
                return 'symlink';
            } catch {
                fs.copyFileSync(hubFile, originalPath);
                p.log.warn(color.yellow(
                    `Could not create a hardlink or symlink (needs Developer Mode/admin for symlinks, ` +
                    `or the Hub must be on the same drive for hardlinks). Fell back to a plain copy — ` +
                    `this file will NOT stay in sync automatically; re-run 'shareagents sync' after editing it.`
                ));
                return 'copy';
            }
        }
    }

    fs.symlinkSync(hubFile, originalPath, 'file');
    return 'symlink';
}

/**
 * True if originalPath is already linked (symlink or hardlink) to hubFilePath.
 */
export function isSyncedToHub(originalPath: string, hubFilePath: string): boolean {
    if (!fs.existsSync(originalPath)) return false;

    try {
        const stats = fs.lstatSync(originalPath);

        if (stats.isSymbolicLink()) {
            if (!fs.existsSync(hubFilePath)) return false;
            const target = fs.readlinkSync(originalPath);
            return path.resolve(target) === path.resolve(hubFilePath);
        }

        if (!fs.existsSync(hubFilePath)) return false;
        const hubStats = fs.statSync(hubFilePath);
        return stats.dev === hubStats.dev && stats.ino === hubStats.ino && stats.nlink > 1;
    } catch {
        return false;
    }
}

/**
 * Performs a safe sync of a single instructions file: resolves content conflicts
 * with the Hub (per `conflictResolution`, decided up front by the caller so this
 * function never has to prompt mid-operation), backs up the original, and links
 * it to the Hub.
 *
 * Unlike a skills folder, a single file can't be "merged" by union - if the Hub
 * and the original disagree, the caller must say which one wins.
 */
export async function safeSyncFile(
    toolName: string,
    originalPath: string,
    hubFilePath: string,
    conflictResolution: ConflictResolution = 'use-mine'
): Promise<void> {
    try {
        if (isSyncedToHub(originalPath, hubFilePath)) {
            p.note(`Link already configured correctly.`, `Skipping ${toolName}`);
            return;
        }

        ensureDir(path.dirname(hubFilePath));
        const hubExists = fs.existsSync(hubFilePath);
        const originalContent = fs.readFileSync(originalPath, 'utf-8');

        if (!hubExists) {
            p.log.step(`Seeding Hub with ${color.cyan(toolName)}'s instructions...`);
            fs.writeFileSync(hubFilePath, originalContent);
        } else {
            const hubContent = fs.readFileSync(hubFilePath, 'utf-8');

            if (hubContent !== originalContent) {
                if (conflictResolution === 'abort') {
                    p.log.warn(`Skipped ${toolName}: left unchanged (conflict not resolved).`);
                    return;
                }

                if (conflictResolution === 'use-mine') {
                    const hubBackup = `${hubFilePath}.backup_${timestamp()}`;
                    fs.copyFileSync(hubFilePath, hubBackup);
                    p.log.step(`Backed up previous Hub content to ${color.dim(hubBackup)}`);
                    fs.writeFileSync(hubFilePath, originalContent);
                }
                // 'keep-hub': Hub is left untouched; the original's differing
                // content is preserved in its own backup below, not lost.
            }
        }

        try {
            const backupPath = `${originalPath}.backup_${timestamp()}`;
            p.log.step(`Backing up original ${toolName} file to ${color.dim(backupPath)}...`);
            fs.renameSync(originalPath, backupPath);

            const method = linkFile(hubFilePath, originalPath);
            p.log.success(color.green(`Successfully synced ${toolName} to Hub (${method}).`));
        } catch (error: any) {
            if (error.code === 'EPERM' || error.code === 'EBUSY') {
                p.log.error(color.red(`\nPermission Denied: Could not back up or link ${toolName}.`));
                p.log.info(color.yellow(`Please completely CLOSE ${toolName} then try again.`));
            } else {
                p.log.error(`Failed to sync ${toolName}: ${error.message}`);
            }
        }
    } catch (error: any) {
        p.log.error(`Generic Error syncing ${toolName}: ${error.message}`);
    }
}

export interface InstructionsPreview {
    name: string;
    path: string;
    preview: string;
}

/**
 * Reads a short preview of each agent's current instructions file, for display
 * before syncing. Unlike skills folders (a list of names), these are prose, so
 * we show a truncated snippet rather than a directory listing.
 */
export function getInstructionsPreview(entries: { name: string; path: string }[], maxChars = 240): InstructionsPreview[] {
    return entries
        .filter(e => fs.existsSync(e.path))
        .map(e => {
            const content = fs.readFileSync(e.path, 'utf-8').trim();
            const preview = content.length > maxChars ? content.slice(0, maxChars) + '…' : content;
            return { name: e.name, path: e.path, preview: preview || '(empty file)' };
        });
}
