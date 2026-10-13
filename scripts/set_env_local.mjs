// .env.local の KEY=VALUE 行を argv から更新する (非シークレット値用。値は表示しない)
// 実行: node scripts/set_env_local.mjs KEY1=VALUE1 KEY2=VALUE2 ...
import { readFileSync, writeFileSync } from "node:fs";

const ENV_PATH = ".env.local";
let env = readFileSync(ENV_PATH, "utf8");

for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf("=");
  if (eq < 0) continue;
  const key = arg.slice(0, eq);
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(env)) {
    env = env.replace(re, arg);
    console.log(`updated: ${key}`);
  } else {
    env += (env.endsWith("\n") ? "" : "\n") + arg + "\n";
    console.log(`added: ${key}`);
  }
}
writeFileSync(ENV_PATH, env);
