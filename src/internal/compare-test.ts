import { compareWithFileSystem as compareWithAdapter } from "../engine.js";
import { nodeFileSystem } from "../files.js";
import type { FileSystem } from "../files.js";

export async function compareWithFileSystem(o:Parameters<typeof compareWithAdapter>[0], fs: FileSystem) {
  return compareWithAdapter(o, fs);
}

export function createRaceFileSystem(): FileSystem {
  let raced = false;
  return {
    ...nodeFileSystem,
    async open(path, flags, mode) {
      const handle = await nodeFileSystem.open(path, flags, mode);
      let calls = 0;
      return new Proxy(handle, {
        get(target, property, receiver) {
          if (property !== "stat") return Reflect.get(target, property, receiver);
          return async () => {
            calls += 1;
            const value = await target.stat();
            if (!raced && calls === 2) {
              raced = true;
              return { ...value, ino: value.ino + 1 };
            }
            return value;
          };
        }
      });
    }
  };
}
