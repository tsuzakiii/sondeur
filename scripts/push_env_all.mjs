// .env.local の全変数を Vercel の全環境 (production, preview, development) に登録する
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const envFile = readFileSync(resolve(".", ".env.local"), "utf8");
const lines = envFile.split("\n").filter(l => l.trim() && !l.startsWith("#"));

for (const line of lines) {
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const key = line.slice(0, eq).trim();
  const val = line.slice(eq + 1).trim();

  // Remove existing first, then add to all environments
  try {
    execSync(`vercel env rm ${key} production --yes`, { stdio: "pipe", cwd: resolve(".") });
  } catch {}
  try {
    execSync(`vercel env rm ${key} preview --yes`, { stdio: "pipe", cwd: resolve(".") });
  } catch {}
  try {
    execSync(`vercel env rm ${key} development --yes`, { stdio: "pipe", cwd: resolve(".") });
  } catch {}

  console.log(`Setting ${key}...`);
  try {
    execSync(`vercel env add ${key} production preview development`, {
      input: val,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: resolve("."),
    });
    console.log("  OK");
  } catch (e) {
    console.log(`  Error: ${e.stderr?.toString().trim() || e.message}`);
  }
}
console.log("\nDone.");
