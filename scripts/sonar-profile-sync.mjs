// Downloads the SonarCloud quality profile this project is analysed with and
// maps every rule to an ESLint rule, writing eslint.sonar.rules.json.
// Public API only, no token. Run via `npm run sonar:sync`; see docs/sonar-local.md.
import { writeFileSync } from 'node:fs';
import { Linter } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import ts from 'typescript';
import sonarLocal from './sonar-local-plugin.js';

const ORGANIZATION = 'alkampfergit-github';
const PROJECT_KEY = 'alkampfergit_azdo-cli';
const LANGUAGE = 'ts'; // "js" for a JavaScript repository
const SONAR_API = 'https://sonarcloud.io/api';
const SONARJS_RULES =
  'https://raw.githubusercontent.com/SonarSource/SonarJS/master/packages/analysis/src/jsts/rules';
// SonarCloud files these as Security Hotspots: they need a review, they do not fail the
// gate on their own, so they are warnings. No API exposes the type; extend when calibrating.
const HOTSPOT_KEYS = new Set(['S4036', 'S5443']);
const OUTPUT = new URL('../eslint.sonar.rules.json', import.meta.url);

// ESLint rules by the plugin prefix SonarJS uses for `externalPlugin`.
const WRAPPED = {
  eslint: { prefix: '', has: (name) => builtinRules.has(name) }, // builtinRules is a Map
  'typescript-eslint': { prefix: '@typescript-eslint/', has: (name) => name in tseslint.plugin.rules },
  unicorn: { prefix: 'unicorn/', has: (name) => name in unicorn.rules },
};

// Rules SonarJS wraps in a decorator that drops most of the underlying rule's reports
// (SonarJS packages/analysis/src/jsts/rules/<key>/decorator.ts). Without the decorator
// the local run reports findings SonarCloud never raises, so they are not enabled.
// Decorators re-created in scripts/sonar-local-plugin.js, enabled instead of the bare rule.
const LOCAL_DECORATORS = {
  S9382: 'sonar-local/no-await-in-loop',
};

const SUPPRESSED_BY_SONARJS = {
  S7727: 'SonarJS reports only callbacks with more than one parameter on array types',
  S7781: 'SonarJS reports only regexes that convert to a plain string literal',
};

async function getJson(path, params) {
  const url = `${SONAR_API}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// The export lists every rule of the profile; api/rules/search hides some.
async function readProfile() {
  const { profiles } = await getJson('qualityprofiles/search', {
    project: PROJECT_KEY,
    organization: ORGANIZATION,
  });
  const profile = profiles.find((p) => p.language === LANGUAGE);
  if (!profile) throw new Error(`no ${LANGUAGE} quality profile on ${PROJECT_KEY}`);
  const res = await fetch(
    `${SONAR_API}/qualityprofiles/export?${new URLSearchParams({
      language: LANGUAGE,
      qualityProfile: profile.name,
      organization: ORGANIZATION,
    })}`,
  );
  if (!res.ok) throw new Error(`profile export: HTTP ${res.status}`);
  const xml = await res.text();
  const rules = [...xml.matchAll(/<rule>(.*?)<\/rule>/gs)].map(([, body]) => ({
    repository: body.match(/<repositoryKey>(.*?)<\/repositoryKey>/)[1],
    key: body.match(/<key>(S\d+)<\/key>/)[1],
    params: Object.fromEntries(
      [...body.matchAll(/<parameter><key>(.*?)<\/key><value>(.*?)<\/value><\/parameter>/gs)].map(
        ([, k, v]) => [k, v],
      ),
    ),
  }));
  return { name: profile.name, rules };
}

function parseMeta(source) {
  const eslintId = source.match(/export const eslintId = '([^']+)'/)?.[1];
  const wrapped = [
    ...source.matchAll(/externalPlugin:\s*'([^']+)',\s*externalRule:\s*'([^']+)'/g),
  ].map(([, plugin, rule]) => ({ plugin, rule }));
  // implementation 'external': the whole rule is `eslintId` of a single plugin
  const plugin = source.match(/export const externalPlugin = '([^']+)'/)?.[1];
  if (wrapped.length === 0 && plugin && eslintId) wrapped.push({ plugin, rule: eslintId });
  return {
    implementation: source.match(/export const implementation = '(\w+)'/)?.[1],
    eslintId,
    wrapped,
  };
}

// `fields` is plain data once the type imports are stripped, so transpile and import it.
async function loadFields(source) {
  if (!source) return undefined;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  return (await import(url)).fields;
}

// SonarQube hands every parameter over as a string; the default tells the real type.
function coerce(raw, fallback) {
  if (raw === undefined) return fallback;
  if (Array.isArray(fallback)) {
    const items = raw === '' ? [] : raw.split(',').map((s) => s.trim());
    return typeof fallback[0] === 'number' ? items.map(Number) : items;
  }
  if (typeof fallback === 'number') return Number(raw);
  if (typeof fallback === 'boolean') return raw === 'true';
  return raw;
}

// Mirrors materializeRuleOptions() in SonarJS (helpers/configs.ts): defaults, then the
// profile parameters (keyed by displayName), then customForConfiguration.
function buildOptions(fields, params) {
  if (!fields?.length) return [];
  const resolve = (prop) => {
    const value = coerce(params[prop.displayName ?? prop.field], prop.default);
    return prop.customForConfiguration ? prop.customForConfiguration(value) : value;
  };
  return fields.map((element) =>
    Array.isArray(element)
      ? Object.fromEntries(element.map((prop) => [prop.field, resolve(prop)]))
      : resolve(element),
  );
}

function resolveTargets(meta) {
  // 1. exported by eslint-plugin-sonarjs under the same name SonarJS uses
  if (meta.eslintId && sonarjs.rules[meta.eslintId]) return { targets: [`sonarjs/${meta.eslintId}`] };
  // 2. a wrapped ESLint / typescript-eslint / unicorn rule
  if (meta.wrapped.length === 0) {
    return { skipped: `SonarJS-only rule (${meta.implementation}), not in eslint-plugin-sonarjs` };
  }
  const targets = [];
  for (const { plugin, rule } of meta.wrapped) {
    const source = WRAPPED[plugin];
    if (!source) return { skipped: `needs eslint-plugin ${plugin}, not used in this repository` };
    if (!source.has(rule)) return { skipped: `${plugin}/${rule} not in the installed plugin` };
    targets.push(`${source.prefix}${rule}`);
  }
  return { targets };
}

async function mapRule(rule, params) {
  if (SUPPRESSED_BY_SONARJS[rule.key]) return { skipped: SUPPRESSED_BY_SONARJS[rule.key] };
  const metaSource = await getText(`${SONARJS_RULES}/${rule.key}/meta.ts`);
  if (!metaSource) return { skipped: 'no meta.ts in SonarJS (rule folder moved or removed?)' };
  const resolved = LOCAL_DECORATORS[rule.key]
    ? { targets: [LOCAL_DECORATORS[rule.key]] }
    : resolveTargets(parseMeta(metaSource));
  if (resolved.skipped) return resolved;
  try {
    const fields = await loadFields(await getText(`${SONARJS_RULES}/${rule.key}/config.ts`));
    return { targets: resolved.targets, options: buildOptions(fields, params) };
  } catch (error) {
    return { skipped: `options not loadable from SonarJS config.ts (${error.code ?? error.message})` };
  }
}

async function mapAll(rules) {
  const enabled = {};
  const sonarKeys = {};
  const skipped = {};
  const queue = rules.filter((r) => r.repository === 'typescript' || r.repository === 'javascript');
  for (const r of rules.filter((x) => !queue.includes(x))) {
    skipped[r.key] = `${r.repository}: needs the full Sonar engine (taint / architecture analysis)`;
  }
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      for (let rule; (rule = queue.shift()); ) {
        const result = await mapRule(rule, rule.params);
        if (result.skipped) {
          skipped[rule.key] = result.skipped;
          continue;
        }
        const level = HOTSPOT_KEYS.has(rule.key) ? 'warn' : 'error';
        for (const target of result.targets) {
          if (enabled[target]) {
            sonarKeys[target] += `,${rule.key}`;
            continue;
          }
          enabled[target] = [level, ...result.options];
          sonarKeys[target] = rule.key;
        }
      }
    }),
  );
  return { enabled, sonarKeys, skipped };
}

// SonarJS handles some options in its own wrapper, so the installed plugin may reject them.
// ESLint validates a rule's options against its schema when the config is built.
function acceptsOptions(target, entry) {
  const plugins = { sonarjs, unicorn, '@typescript-eslint': tseslint.plugin, 'sonar-local': sonarLocal };
  try {
    new Linter({ configType: 'flat' }).verify('', [{ plugins, rules: { [target]: entry } }]);
    return true;
  } catch (error) {
    // Options are validated first; a type-aware rule then fails to load without a program.
    return String(error.message).includes('requires type information');
  }
}

function findRule(target) {
  if (target.startsWith('sonarjs/')) return sonarjs.rules[target.slice('sonarjs/'.length)];
  if (target.startsWith('@typescript-eslint/')) return tseslint.plugin.rules[target.slice('@typescript-eslint/'.length)];
  if (target.startsWith('sonar-local/')) return sonarLocal.rules[target.slice('sonar-local/'.length)];
  if (target.startsWith('unicorn/')) return unicorn.rules[target.slice('unicorn/'.length)];
  return builtinRules.get(target);
}

// Keeps, per object option, only the properties the installed rule's schema knows.
function pruneOptions(target, options) {
  const schema = findRule(target)?.meta?.schema;
  const schemas = Array.isArray(schema) ? schema : schema ? [schema] : [];
  return options.map((option, i) => {
    const known = schemas[i]?.properties;
    if (!known || typeof option !== 'object' || option === null || Array.isArray(option)) return option;
    return Object.fromEntries(Object.entries(option).filter(([key]) => key in known));
  });
}

function validateOptions(enabled) {
  const notes = {};
  for (const [target, entry] of Object.entries(enabled)) {
    if (entry.length === 1 || acceptsOptions(target, entry)) continue;
    const pruned = [entry[0], ...pruneOptions(target, entry.slice(1))];
    if (acceptsOptions(target, pruned)) {
      enabled[target] = pruned;
      notes[target] = 'options SonarJS handles itself were dropped; the rest apply';
    } else {
      enabled[target] = [entry[0]];
      notes[target] = 'SonarJS options rejected by the installed rule schema; using the rule defaults';
    }
  }
  return notes;
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const profile = await readProfile();
const { enabled, sonarKeys, skipped } = await mapAll(profile.rules);
const notes = validateOptions(enabled);
writeFileSync(
  OUTPUT,
  JSON.stringify(
    {
      profile: `${profile.name} (${LANGUAGE})`,
      rules: sortKeys(enabled),
      sonarKeys: sortKeys(sonarKeys),
      skipped: sortKeys(skipped),
      notes: sortKeys(notes),
    },
    null,
    2,
  ) + '\n',
);

const missing = Object.values(skipped).filter((r) => r.startsWith('no meta.ts')).length;
console.log(
  `${profile.rules.length} rules in "${profile.name}": ${Object.keys(enabled).length} ESLint rules enabled, ` +
    `${Object.keys(skipped).length} skipped`,
);
for (const [target, note] of Object.entries(notes)) console.warn(`note: ${target}: ${note}`);
if (missing > 0) {
  console.warn(`warning: ${missing} rules have no meta.ts; SonarJS may have changed its layout`);
}
