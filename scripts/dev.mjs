#!/usr/bin/env node
/**
 * Start the Sol coach server, the Rust bidding sidecar, and Vite.
 * Ctrl-C stops all three.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function run(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[dev] ${label} stopped (${signal})`);
    } else if (code && code !== 0) {
      console.error(`[dev] ${label} exited ${code}`);
    }
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  // Hard-exit shortly after so hung children cannot pin the shell.
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const viteBin = join(root, "node_modules/vite/bin/vite.js");
run("coach", process.execPath, [join(root, "scripts/coach-server.mjs")]);
run("system", "cargo", ["run", "-p", "bridge-system", "--", "serve"]);
run("vite", process.execPath, [viteBin]);
