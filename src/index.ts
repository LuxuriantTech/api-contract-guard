import { compareWithFileSystem } from "./engine.js";
import { nodeFileSystem } from "./files.js";
import type { CompareOptions } from "./model.js";

export type { CompareOptions, ErrorCode } from "./model.js";
export { rules } from "./model.js";

export async function compare(options: CompareOptions) {
  return compareWithFileSystem(options, nodeFileSystem);
}
