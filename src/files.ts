import { constants } from "node:fs";
import type { Stats } from "node:fs";
import { lstat, mkdir, open, realpath, rmdir, unlink } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { FileHandle } from "node:fs/promises";
import { Fail } from "./model.js";

export interface FileSystem {
  lstat(path: string): Promise<Stats>;
  mkdir(path: string, options: { mode: number }): Promise<void>;
  open(path: string, flags: number | string, mode?: number): Promise<FileHandle>;
  realpath(path: string): Promise<string>;
  rmdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export const nodeFileSystem: FileSystem = { lstat, mkdir, open, realpath, rmdir, unlink };

export interface FileIdentity { dev: number; ino: number }
export interface ReservedDirectory { path: string; identity: FileIdentity; created: Map<string, FileIdentity> }

function sameIdentity(a: FileIdentity, b: FileIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function relativeParts(value: string): string[] {
  if (!value || resolve(value) === value || value.split(/[\\/]/u).includes("..")) throw new Fail("PATH_INVALID");
  return value.split(/[\\/]/u).filter(Boolean);
}

async function assertNoSymlinkComponents(fs: FileSystem, root: string, parts: string[]): Promise<void> {
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Fail("PATH_INVALID");
    } catch (error) {
      if (error instanceof Fail) throw error;
      throw new Fail("PATH_INVALID");
    }
  }
}

export async function prepareRoot(fs: FileSystem, suppliedRoot: string): Promise<string> {
  let root: string;
  let stat: Stats;
  try {
    const supplied = await fs.lstat(suppliedRoot);
    if (!supplied.isDirectory() || supplied.isSymbolicLink()) throw new Fail("PATH_INVALID");
    root = await fs.realpath(suppliedRoot);
    stat = await fs.lstat(root);
  } catch (error) {
    if (error instanceof Fail) throw error;
    throw new Fail("PATH_INVALID");
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Fail("PATH_INVALID");
  return root;
}

export async function reserveOutputDirectory(fs: FileSystem, root: string, outDir: string): Promise<ReservedDirectory> {
  const parts = relativeParts(outDir);
  if (parts.length === 0) throw new Fail("PATH_INVALID");
  await assertNoSymlinkComponents(fs, root, parts.slice(0, -1));
  const path = join(root, ...parts);
  try {
    await fs.mkdir(path, { mode: 0o700 });
  } catch {
    throw new Fail("OUTPUT_INVALID");
  }
  const stat = await fs.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Fail("OUTPUT_INVALID");
  return { path, identity: { dev: stat.dev, ino: stat.ino }, created: new Map() };
}

export async function readConfinedFile(fs: FileSystem, root: string, relativePath: string): Promise<{ path: string; text: string; identity: FileIdentity; size: number }> {
  const parts = relativeParts(relativePath);
  const candidate = resolve(root, ...parts);
  if (candidate !== root && !candidate.startsWith(root + sep)) throw new Fail("PATH_INVALID");
  await assertNoSymlinkComponents(fs, root, parts);
  let handle: FileHandle;
  try {
    handle = await fs.open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new Fail("PATH_INVALID");
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Fail("PATH_INVALID");
    if (before.size > 1_048_576) throw new Fail("INPUT_LIMIT");
    const text = await handle.readFile({ encoding: "utf8" });
    const after = await handle.stat();
    if (!sameIdentity(before, after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Fail("INPUT_RACE");
    let path: string;
    try {
      path = await fs.realpath(candidate);
    } catch {
      throw new Fail("PATH_INVALID");
    }
    if (path !== root && !path.startsWith(root + sep)) throw new Fail("PATH_INVALID");
    return { path, text, identity: { dev: before.dev, ino: before.ino }, size: before.size };
  } finally {
    await handle.close();
  }
}

export function inputCacheKey(root: string, relativePath: string): string {
  return resolve(root, ...relativeParts(relativePath));
}

export async function publishFile(fs: FileSystem, output: ReservedDirectory, name: string, content: string): Promise<void> {
  const path = join(output.path, name);
  const handle = await fs.open(path, "wx", 0o600);
  try {
    const opened = await handle.stat();
    output.created.set(path, { dev: opened.dev, ino: opened.ino });
    await handle.writeFile(content, "utf8");
    await handle.sync();
    const stat = await handle.stat();
    if (!sameIdentity(opened, stat)) throw new Fail("OUTPUT_INVALID");
  } finally {
    await handle.close();
  }
}

export async function cleanupReservedOutput(fs: FileSystem, output: ReservedDirectory | undefined): Promise<void> {
  if (!output) return;
  for (const [path, expected] of output.created) {
    try {
      const current = await fs.lstat(path);
      if (current.isFile() && sameIdentity(current, expected)) await fs.unlink(path);
    } catch { /* A missing or replaced file is deliberately left alone. */ }
  }
  try {
    const current = await fs.lstat(output.path);
    if (current.isDirectory() && !current.isSymbolicLink() && sameIdentity(current, output.identity)) await fs.rmdir(output.path);
  } catch { /* A non-empty or replaced directory is deliberately left alone. */ }
}

export function referenceRelative(root: string, from: string, file: string): string {
  return join(relative(root, resolve(join(root, from), "..")), file);
}
