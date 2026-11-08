import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: ["commander"],
  clean: true,
  // The agent skill (skills/azdo/) is inlined so it always matches the installed version.
  loader: { ".md": "text" },
});
