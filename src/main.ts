#!/usr/bin/env node
import { runCli } from "./cli.js";

const io = { stdout: "", stderr: "" };
const exitCode = await runCli(process.argv.slice(2), io);
if (io.stdout) process.stdout.write(io.stdout);
if (io.stderr) process.stderr.write(io.stderr);
process.exitCode = exitCode;
