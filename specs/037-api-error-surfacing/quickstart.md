# Quickstart: 037-api-error-surfacing

## Before

```console
$ azdo pr open --title "Fix the thing" --description "$(cat long-description.md)"
Error: Azure DevOps request failed with HTTP_400.
```

## After — pre-flight catches it without a round trip

```console
$ azdo pr open --title "Fix the thing" --description "$(cat long-description.md)"
Error: description is 4172 characters (2299 provided + 2 separator + 1871 from the repository pull request template .azuredevops/pull_request_template.md), exceeding the Azure DevOps limit of 4000 characters. Shorten the description by at least 172 characters.
```

## After — any endpoint, any status, the server explains itself

```console
$ azdo get-item 42 --fields Foo.Bar
Error: Request rejected: TF401232: Work item field reference is invalid: Foo.Bar

$ azdo pr comments --pr-number 9999
Error: Access denied. Your PAT may lack read permissions for project "Demo".
  TF401019: The Git repository with name or identifier demo is disabled. [GitRepositoryDisabledException]
```

## Verify locally

```bash
npm test && npm run lint
npx vitest run tests/unit/api-error-surfacing.test.ts
```
