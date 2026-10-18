// Local mirror of the SonarCloud analysis (see docs/sonar-local.md). Enables exactly the
// rules of eslint.sonar.rules.json, which `npm run sonar:sync` generates from the quality
// profile. The normal lint stays in eslint.config.js.
import { readFileSync } from "node:fs";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";
import sonarLocal from "./scripts/sonar-local-plugin.js";

const { rules } = JSON.parse(
  readFileSync(new URL("./eslint.sonar.rules.json", import.meta.url), "utf8"),
);

export default [
  { ignores: ["dist/", "node_modules/", "coverage/"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      sonarjs,
      unicorn,
      "@typescript-eslint": tseslint.plugin,
      "sonar-local": sonarLocal,
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules,
  },
];
