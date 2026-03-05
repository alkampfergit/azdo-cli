# CLI Interface Contract: azdo

**Package**: `azdo-cli` | **Executable**: `azdo` | **Version**: 0.1.0

## Command Schema

```text
azdo [options]
```

## Options

| Flag             | Short | Argument | Description                    | Exit Code |
|------------------|-------|----------|--------------------------------|-----------|
| `--version`      | `-v`  | None     | Print version number and exit  | 0         |
| `--help`         | `-h`  | None     | Print help information and exit | 0        |

## Behavior: No Arguments

When invoked with no arguments (`azdo`), the tool MUST display the help output (identical to `--help`) and exit with code 0.

## Behavior: Unknown Options

When invoked with an unrecognized flag (e.g., `azdo --foo`), the tool MUST:
1. Print an error message to stderr indicating the unknown option
2. Print the help output to stdout
3. Exit with code 1

## Output Format

### Version Output (stdout)

```text
0.1.0
```

Plain version string, no prefix, followed by a newline.

### Help Output (stdout)

```text
Usage: azdo [options]

Azure DevOps CLI tool

Options:
  -v, --version  output the version number
  -h, --help     display help for command
```

### Error Output (stderr + stdout)

```text
error: unknown option '--foo'
```

Followed by the help output on stdout.

## npm Package Contract

| Field         | Value                |
|---------------|----------------------|
| name          | `azdo-cli`           |
| bin           | `{ "azdo": "./dist/index.js" }` |
| files         | `["dist"]`           |
| main          | `./dist/index.js`    |
| type          | `module`             |

## Distribution Tags

| Branch   | npm Tag   | Version Example         |
|----------|-----------|-------------------------|
| master   | `latest`  | `0.1.0`                 |
| develop  | `next`    | `0.1.0-next.{build}`    |
| feature/* | `dev`    | `0.1.0-dev.{build}`     |
