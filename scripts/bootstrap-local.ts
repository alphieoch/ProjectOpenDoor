import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[]) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: new URL("..", import.meta.url).pathname,
    env: process.env,
    timeout: 10 * 60 * 1000,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function main() {
  await run("bunx", [
    "--cwd",
    "packages/database",
    "drizzle-kit",
    "push",
    "--force",
  ]);
  await run("bun", ["--env-file=.env", "run", "scripts/seed.ts"]);
  await run("bun", ["--env-file=.env", "packages/database/src/seed.ts"]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
