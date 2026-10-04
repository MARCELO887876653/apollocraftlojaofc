// Guarantees Convex's generated types exist before `tsc -b` runs.
//
// Vercel clones the repository and runs `npm run build` (= `tsc -b && vite build`).
// The generated files in `src/convex/_generated` are committed to the repo, so
// normally they are already present and this script is a no-op.
//
// If they are missing (e.g. a clone that does not include them), we regenerate
// them with the Convex CLI. That requires a deployment to be configured, which
// is done by setting `CONVEX_DEPLOY_KEY` in the build environment.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = join(root, "src", "convex", "_generated");
const required = ["api.js", "server.js", "api.d.ts", "server.d.ts"];

const missing = required.filter((file) => !existsSync(join(generatedDir, file)));

if (missing.length === 0) {
  console.log("[convex-codegen] src/convex/_generated present — skipping codegen.");
  process.exit(0);
}

if (!process.env.CONVEX_DEPLOY_KEY && !process.env.CONVEX_DEPLOYMENT) {
  console.error(
    `[convex-codegen] Missing generated files (${missing.join(", ")}) and no ` +
      "CONVEX_DEPLOY_KEY/CONVEX_DEPLOYMENT is set. Commit src/convex/_generated " +
      "to the repository, or set CONVEX_DEPLOY_KEY in the build environment.",
  );
  process.exit(1);
}

console.log("[convex-codegen] Missing generated files — running `convex codegen`...");
execSync("convex codegen", { cwd: root, stdio: "inherit", env: process.env });

if (required.some((file) => !existsSync(join(generatedDir, file)))) {
  console.error("[convex-codegen] `convex codegen` did not produce the expected files.");
  process.exit(1);
}

console.log("[convex-codegen] Generated Convex types successfully.");
