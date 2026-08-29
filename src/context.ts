import type { FileSystem } from "./files.js";
import type { Warning, WarningCode } from "./model.js";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface LoadedDocument { realpath: string; relativePath: string; value: JsonValue }
export interface RunContext { root: string; fs: FileSystem; bytes: number; files: Set<string>; nodes: number; resolutions: number; hashes: Record<string, string>; documentCache: Map<string, LoadedDocument>; rawCache: Map<string, { path: string; text: string; size: number }>; warnings: Warning[] }
export function createRunContext(root: string, fs: FileSystem): RunContext { return { root, fs, bytes: 0, files: new Set(), nodes: 0, resolutions: 0, hashes: Object.create(null), documentCache: new Map(), rawCache: new Map(), warnings: [] }; }
export function addWarning(context: RunContext, code: WarningCode, location: string, message: string): void { if (!context.warnings.some((warning) => warning.code === code && warning.location === location && warning.message === message)) context.warnings.push({ code, location, message }); }
export function isRecord(value: unknown): value is { [key: string]: JsonValue } { return value !== null && typeof value === "object" && !Array.isArray(value); }
