---
name: azdo-grounder
description: analyze a user feature request to compare against the real features of azure devops to help the user create a better feature request that is grounded in the real capabilities of Azure DevOps
---

# Azure DevOps API Grounding

You are running the **ADO Ground** pre-specification step. Your job is to
research Azure DevOps REST API capabilities relevant to the user's feature idea, then run a structured Q&A to align their requirements with what the API actually supports before /speckit.specify is called.

## Input

The user has described a feature idea involving Azure DevOps. Read it from:
- Their prompt if provided inline
- `.specify/ado-ground/draft-idea.md` if it exists

## Step 1 — Research Phase

Use the **Context7** MCP tool to look up:
- The Azure DevOps REST API documentation for the relevant service area
  (e.g., Work Items, Pipelines, Repos, Boards, Test Plans)
- Any SDK or client library patterns relevant to .NET integrations

Use the **Microsoft Learn** MCP tool to look up:
- Official Azure DevOps REST API reference for the endpoints relevant
  to the user's feature
- Known limitations, required permissions (PAT scopes, OAuth scopes),
  pagination behavior, and rate limits

Then search the internet for useful information that can be related to the user feature.

Summarize your findings in a "Capability Report" with:
- What does the service actually supports
- Eventual ambiguities with the user features
- Unsupported or missing capabilities relative to the user's idea
- Recommended API patterns for the use case

## Step 2 — Q&A Grounding Loop

Based on the Capability Report, ask the user targeted questions — ONE AT
A TIME — to ground their request into real API behavior.

**What you need to clarify**

- Features that present ambiguity with the real capabilities of Azure DevOps
- Features that does not align well with the api surface 
- Features that are already implemented in this tool and the user is not aware of (in this situatino probably we need to expand the existing features to support the user request)

For each question:

1. State the assumption you are clarifying
2. If needed explain to the user the reality of the API capabilities and how it differs from their assumption or why the feature request is ambiguous
3. Present the options to the user leaving always a final option that allows for user input to clarify

This process will help the user to refine / expand / scope their feature request to align with the real capabilities of Azure DevOps.

Continue the loop until all significant gaps are resolved or explicitly
accepted as out-of-scope.

Example question format:
> **Assumption:** You want to create work items with custom field values.
> **Reality:** The Work Items API supports custom fields only if the process
> template defines them. Fields cannot be created via API in inherited processes.
> **Question:** Should we scope this feature to existing fields only, or do
> you want to add a setup step that verifies field existence first?

Another Example question format:
> **Assumption:** You want to create a new pipeline with a YAML definition.
> **Reality:** The Pipelines API allows creating pipelines with YAML, but the
> definition must be stored in a repository. The API does not support creating pipeline directly
> **Question:** Should we scope this feature to pipelines that already have a YAML definition in a repo, or do you want to add a setup step that creates the repo and commits the YAML first?

## Step 3 — Output

Write a file `.specify/ado-ground/grounding-report.md` containing:
- The original feature idea (verbatim)
- The Capability Report from Step 1
- All Q&A exchanges with the user's answers
- A "Grounded Feature Summary" section — a revised description of the
  feature constrained to actual API capabilities

Then tell the user:
> Grounding complete. You can now run `/speckit.specify` and paste the
> Grounded Feature Summary as your input, or reference the grounding
> report directly.