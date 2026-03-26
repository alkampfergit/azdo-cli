import type { ParsedField, TaskDocument } from '../types/work-item.js';

const FIELD_ALIASES = new Map<string, string>([
  ['title', 'System.Title'],
  ['assignedto', 'System.AssignedTo'],
  ['assigned to', 'System.AssignedTo'],
  ['state', 'System.State'],
  ['description', 'System.Description'],
  ['acceptancecriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'],
  ['acceptance criteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'],
  ['tags', 'System.Tags'],
  ['priority', 'Microsoft.VSTS.Common.Priority'],
]);

const RICH_TEXT_FIELDS = new Set<string>([
  'System.Description',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
]);

const REFERENCE_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

function normalizeAlias(name: string): string {
  return name.trim().replaceAll(/\s+/g, ' ').toLowerCase();
}

function parseScalarValue(rawValue: string | undefined, fieldName: string): string | null {
  if (rawValue === undefined) {
    throw new Error(`Malformed YAML front matter: missing value for "${fieldName}"`);
  }

  const trimmed = rawValue.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') {
    return null;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }

  if (/^[[{]|^[>|]-?$/.test(trimmed)) {
    throw new Error(`Malformed YAML front matter: unsupported value for "${fieldName}"`);
  }

  return trimmed;
}

function parseFrontMatter(content: string): { frontMatter: string; remainder: string } {
  if (!content.startsWith('---')) {
    return { frontMatter: '', remainder: content };
  }

  const frontMatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const match = frontMatterPattern.exec(content);
  if (!match) {
    throw new Error('Malformed YAML front matter: missing closing "---"');
  }

  return {
    frontMatter: match[1],
    remainder: content.slice(match[0].length),
  };
}

function assertKnownField(name: string, kind: 'scalar' | 'rich-text'): string {
  const resolved = resolveFieldName(name);
  if (!resolved) {
    const prefix = kind === 'rich-text' ? 'Unknown rich-text field' : 'Unknown field';
    throw new Error(`${prefix}: ${name}`);
  }

  if (kind === 'rich-text' && !RICH_TEXT_FIELDS.has(resolved)) {
    throw new Error(`Unknown rich-text field: ${name}`);
  }

  return resolved;
}

function pushField(
  fields: ParsedField[],
  seen: Set<string>,
  refName: string,
  value: string | null,
  kind: 'scalar' | 'rich-text',
): void {
  if (seen.has(refName)) {
    throw new Error(`Duplicate field: ${refName}`);
  }

  seen.add(refName);
  fields.push({
    refName,
    value,
    op: value === null ? 'clear' : 'set',
    kind,
  });
}

function parseScalarFields(frontMatter: string, fields: ParsedField[], seen: Set<string>): void {
  if (frontMatter.trim() === '') {
    return;
  }

  for (const rawLine of frontMatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      continue;
    }

    const separatorIndex = rawLine.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Malformed YAML front matter: ${rawLine.trim()}`);
    }

    const rawName = rawLine.slice(0, separatorIndex).trim();
    const rawValue = rawLine.slice(separatorIndex + 1);
    const refName = assertKnownField(rawName, 'scalar');
    const value = parseScalarValue(rawValue, rawName);

    pushField(fields, seen, refName, value, 'scalar');
  }
}

function parseRichTextSections(content: string, fields: ParsedField[], seen: Set<string>): void {
  const headingPattern = /^##[ \t]+(.+?)\s*$/gm;
  const matches = [...content.matchAll(headingPattern)];

  if (matches.length === 0) {
    return;
  }

  const prefix = content.slice(0, matches[0].index);
  if (prefix.trim() !== '') {
    throw new Error('Unexpected content before the first markdown heading section');
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const rawName = match[1].trim();
    const refName = assertKnownField(rawName, 'rich-text');
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = index + 1 < matches.length ? matches[index + 1].index ?? content.length : content.length;
    const rawBody = content.slice(bodyStart, bodyEnd).replace(/^\r?\n/, '');
    const value = rawBody.trim() === '' ? null : rawBody.replace(/\s+$/u, '');

    pushField(fields, seen, refName, value, 'rich-text');
  }
}

export function resolveFieldName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') {
    return null;
  }

  const alias = FIELD_ALIASES.get(normalizeAlias(trimmed));
  if (alias) {
    return alias;
  }

  return REFERENCE_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function parseTaskDocument(content: string): TaskDocument {
  const { frontMatter, remainder } = parseFrontMatter(content);
  const fields: ParsedField[] = [];
  const seen = new Set<string>();

  parseScalarFields(frontMatter, fields, seen);
  parseRichTextSections(remainder, fields, seen);

  return { fields };
}
