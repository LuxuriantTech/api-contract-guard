import { compare } from "./index.js";

interface CliIo { stdout: string; stderr: string }

export async function runCli(args: string[], io: CliIo): Promise<number> {
  io.stdout = "";
  io.stderr = "";
  if (args[0] !== "compare") {
    io.stderr = "ERROR CLI_USAGE\n";
    return 3;
  }
  const options: Record<string, string> = {};
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) {
      io.stderr = "ERROR CLI_USAGE\n";
      return 3;
    }
    options[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  if (!options.root || !options.baseline || !options.candidate || !options.outDir) {
    io.stderr = "ERROR CLI_USAGE\n";
    return 3;
  }
  const result = await compare({
    root: options.root,
    baseline: options.baseline,
    candidate: options.candidate,
    outDir: options.outDir,
    ...(options.consumers ? { consumers: options.consumers } : {})
  });
  if (result.exitCode === 3) io.stderr = `ERROR ${result.errorCode}\n`;
  else io.stdout = `${JSON.stringify(result.report)}\n`;
  return result.exitCode;
}
