import process from "node:process";

import { startVitest } from "vitest/node";

const watch = process.argv.includes("--watch");

const ctx = await startVitest(
  "test",
  ["test/securityReliability.test.ts"],
  {
    watch,
    run: !watch,
    config: false,
    configLoader: "runner"
  },
  {
    resolve: {
      preserveSymlinks: true
    },
    test: {
      environment: "node",
      pool: "threads",
      include: ["test/securityReliability.test.ts"]
    }
  }
);

if (!watch) {
  await ctx?.close();

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
}
