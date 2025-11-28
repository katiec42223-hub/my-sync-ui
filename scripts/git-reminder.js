#!/usr/bin/env node
// scripts/git-reminder.js
// Usage:
//   node scripts/git-reminder.js           -> single check/prompt
//   node scripts/git-reminder.js --watch 60000  -> check every 60s
const { execSync, spawnSync } = require("child_process");
const readline = require("readline");

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return "";
  }
}

function listChanged() {
  // porcelain lists files and status codes
  const out = run("git status --porcelain");
  if (!out) return [];
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + " (y/N) ", (ans) => {
      rl.close();
      resolve(String(ans || "").toLowerCase().startsWith("y"));
    });
  });
}

function promptLine(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + ": ", (ans) => {
      rl.close();
      resolve(String(ans || ""));
    });
  });
}

async function checkOnce() {
  // ensure we're in a git repo
  const isRepo = run("git rev-parse --is-inside-work-tree");
  if (!isRepo) {
    console.log("Not inside a git repository.");
    return;
  }

  const changes = listChanged();
  if (changes.length === 0) {
    console.log("No unstaged/uncommitted changes found.");
    return;
  }

  console.log("\nGit reminder: there are changes in this repo:");
  changes.forEach((c) => console.log("  " + c));
  const want = await promptYesNo("Would you like to add & commit these changes now?");
  if (!want) {
    console.log("Okay — I'll remind you later (or run this script again when you're ready).");
    return;
  }

  // ask for commit message
  let msg = await promptLine("Commit message (leave empty for 'wip')");
  if (!msg) msg = "wip";

  // run add & commit
  console.log("Staging all changes...");
  const add = spawnSync("git", ["add", "--all"], { stdio: "inherit" });
  if (add.status !== 0) {
    console.error("git add failed.");
    return;
  }
  console.log("Committing…");
  const commit = spawnSync("git", ["commit", "-m", msg], { stdio: "inherit" });
  if (commit.status !== 0) {
    console.error("git commit failed (maybe nothing to commit).");
    return;
  }
  console.log("Committed with message:", msg);
}

async function main() {
  const argv = process.argv.slice(2);
  const watchIdx = argv.indexOf("--watch");
  if (watchIdx >= 0) {
    const interval = Number(argv[watchIdx + 1]) || 60000;
    console.log(`git-reminder: watch mode enabled (interval ${interval} ms). Press Ctrl+C to stop.`);
    // run immediately, then loop
    await checkOnce();
    setInterval(async () => {
      await checkOnce();
    }, interval);
  } else {
    await checkOnce();
  }
}

main().catch((err) => {
  console.error("git-reminder error:", err);
  process.exit(1);
});