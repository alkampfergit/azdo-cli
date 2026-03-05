# The Complete Guide to Structuring Claude Code Skills

> A comprehensive, practical guide to building, organizing, and optimizing Agent Skills for Claude Code. Merges official Anthropic design principles with advanced techniques and real-world patterns.

---

## Table of Contents

1. [What Are Skills?](#1-what-are-skills)
2. [Skill Fundamentals & Design Principles](#2-skill-fundamentals--design-principles)
3. [Anatomy of a Well-Structured Skill](#3-anatomy-of-a-well-structured-skill)
4. [File Structure & Technical Requirements](#4-file-structure--technical-requirements)
5. [Writing the SKILL.md File](#5-writing-the-skillmd-file)
6. [Mastering the Description Field](#6-mastering-the-description-field)
7. [YAML Frontmatter Reference](#7-yaml-frontmatter-reference)
8. [Instruction Body Best Practices](#8-instruction-body-best-practices)
9. [Advanced Features (Claude Code 2.1+)](#9-advanced-features-claude-code-21)
10. [Progressive Disclosure & Information Architecture](#10-progressive-disclosure--information-architecture)
11. [Skill-Scoped Hooks & Governance](#11-skill-scoped-hooks--governance)
12. [Context Forking & Sub-Agents](#12-context-forking--sub-agents)
13. [MCP Integration Patterns](#13-mcp-integration-patterns)
14. [Common Workflow Patterns](#14-common-workflow-patterns)
15. [Testing & Iteration](#15-testing--iteration)
16. [Troubleshooting & Common Pitfalls](#16-troubleshooting--common-pitfalls)
17. [Distribution & Sharing](#17-distribution--sharing)
18. [Quick Checklists](#18-quick-checklists)

---

## 1. What Are Skills?

A **Skill** is a folder-based package that extends Claude Code's capabilities for specific tasks. Think of it as reusable, specialized expertise that Claude can discover and load automatically when relevant.

**Key characteristics:**

- Skills use **semantic reasoning** (not keyword matching) to activate—Claude reads your skill's description and judges relevance to the current task
- They follow **progressive disclosure**—only lightweight metadata loads initially; full instructions load on-demand, keeping token usage efficient
- They are **composable**—multiple skills can activate simultaneously (e.g., a `brand-guidelines` skill alongside a `presentation-creation` skill)
- They follow an **open standard**—portable across Claude.ai, Claude Code, and the API

**Why they matter:**

Without skills, you repeat context, preferences, and procedures in every conversation. With skills, you teach Claude once and benefit repeatedly. This is especially powerful for:

- Teams enforcing standards across projects
- Developers codifying workflows for reuse
- Integrations (MCP servers) providing best-practice guidance
- Complex multi-step processes that benefit from consistent methodology

---

## 2. Skill Fundamentals & Design Principles

Anthropic's official design philosophy rests on three core principles:

### Principle 1: Progressive Disclosure

Skills use a three-level system to minimize token usage while maintaining expertise:

| Level | What Loads | When | Why |
|---|---|---|---|
| **Metadata** | YAML frontmatter only | Every session | Just enough for Claude to know *when* to use the skill |
| **Instructions** | SKILL.md body | On demand | When Claude judges the skill is relevant |
| **References** | Linked files | On demand | Only when Claude needs specific details |

**Example:** A `financial-analysis` skill:
- **Level 1 (always):** Description: "Analyze financial statements and create models with sensitivity analysis"
- **Level 2 (if relevant):** Full SKILL.md with workflows
- **Level 3 (if needed):** reference/formulas.md, reference/ratios.md, reference/examples.md

This hierarchy means 10 available skills cost only ~300 tokens in metadata, not 2000+ tokens each.

### Principle 2: Composability

A skill should work well alongside others, not assume it's the only capability available.

**Good composability:**
```
A `brand-guidelines` skill works with:
- `presentation-creation` skill
- `document-writing` skill
- `design-review` skill
- `social-media-content` skill
```

Each skill provides standalone value but also enhances others.

**Bad composability:**
```
A skill that says: "You are the ONLY expert on this domain.
All other advice is wrong. Never listen to other skills."
```

### Principle 3: Portability

Skills work identically across Claude.ai, Claude Code, and the API without modification. This means:

- Use relative paths (no absolute paths)
- Bundle everything inside the skill folder
- Don't assume specific tools are available unless bundled
- Keep environment-specific config in separate optional files

---

## 3. Anatomy of a Well-Structured Skill

Every skill follows this directory structure:

```
skill-name/
├── SKILL.md                    # Required: metadata + instructions
├── references/                 # Optional: detailed docs (loaded on-demand)
│   ├── guide.md
│   ├── api.md
│   └── examples.md
├── scripts/                    # Optional: executable utilities
│   ├── process.py
│   └── validate.sh
└── templates/                  # Optional: reusable templates
    └── output.json
```

### The SKILL.md File (Critical)

This is the heart of your skill. It has two parts:

**Part 1: YAML Frontmatter** (metadata that loads every session)
```yaml
---
name: financial-analysis
description: >
  Analyze financial statements and create models with sensitivity analysis.
  Use when analyzing company financials, creating investment memos,
  or modeling scenarios.
---
```

**Part 2: Markdown Body** (instructions for performing the task)
```markdown
# Financial Analysis

## Step 1: Data Collection
Fetch financial statements from the available sources...

## Step 2: Ratio Analysis
Calculate key financial ratios:
- Profitability ratios (ROE, ROA, profit margin)
- Liquidity ratios (current ratio, quick ratio)
...
```

### Why This Two-Part Structure?

The separation is **deliberate and important**:

- **Frontmatter loads always** → Claude knows about your skill without loading the full body
- **Body loads on demand** → Only consumed when Claude actually needs it
- **This balance optimizes the context window** for all available skills

---

## 4. File Structure & Technical Requirements

### Folder Naming Rules

| Rule | Example |
|---|---|
| **kebab-case only** | `financial-analysis` ✓ / `Financial-Analysis` ✗ / `financial_analysis` ✗ |
| **No spaces** | `code-review` ✓ / `code review` ✗ |
| **No special characters** | `pdf-processor` ✓ / `pdf@processor` ✗ |
| **Lowercase** | `brand-guidelines` ✓ / `Brand-Guidelines` ✗ |

### Critical File Naming Requirements

| Requirement | Details |
|---|---|
| **SKILL.md (exact spelling)** | Must be exactly `SKILL.md` (case-sensitive). Not `SKILL.MD`, `skill.md`, `Skills.md`, or variants. |
| **Location** | Must be at the **root** of the skill folder. Claude won't find it if nested deeper. |
| **No README.md inside** | Do not include a README inside the skill folder. All docs go in SKILL.md or `references/`. (Use a repo-level README if hosting on GitHub.) |

### Reserved Names to Avoid

```
✗ anthropic-helper
✗ claude-anything
✗ anthropic-skills
✗ anything-anthropic
```

Skills cannot contain "claude" or "anthropic" in the name (reserved for official use).

### No XML Tags in Frontmatter

Because frontmatter appears in Claude's system prompt:

```yaml
✗ description: >
  Use <important>this</important> for data
  
✓ description: >
  Use this for data, and remember to validate
```

### File Size Limits

| Component | Limit | Guidelines |
|---|---|---|
| **SKILL.md** | 5,000 words max | Keep concise; move detail to `references/` |
| **Skill name** | 64 characters max | Usually 15-40 chars is ideal |
| **Description** | 1,024 characters max | Typically 150-300 chars is right |
| **Simultaneous skills** | 20-50 recommended | Performance degrades with 50+ skills |

### Path Conventions

**Always use forward slashes** `/` in paths, even on Windows:

```yaml
✓ references/guide.md
✓ scripts/helper.py
✓ templates/report.json

✗ references\guide.md
✗ scripts\helper.py
```

This ensures cross-platform compatibility.

### Environment-Specific Personal Skills

Personal skills (in `~/.claude/skills/`) live on your machine only, so you can safely:

- **Hardcode absolute paths** → `/usr/local/bin/my-tool` or `C:\Tools\custom.exe`
- **Reference local tools** → Custom build toolchains, locally running databases
- **Include machine-specific scripts** → They won't be shared

Project skills (in `.claude/skills/`) must be portable and should avoid hardcoded paths.

---

## 5. Writing the SKILL.md File

### File Structure Template

```markdown
---
name: your-skill
description: >
  [What it does]. Use when [specific trigger phrases].
---

# Your Skill Name

## Instructions

### Step 1: [First Major Step]
Clear explanation of what happens.

Example:
```bash
command-to-run --flag value
```

### Step 2: [Second Major Step]
Another step with clear instructions.

## Examples

**Example 1: [Common Scenario]**
User says: "[Typical user request]"
Actions:
1. Do X
2. Do Y
Result: [What success looks like]

**Example 2: [Another Scenario]**
User says: "[Different typical request]"
Actions:
1. Do A
2. Do B
Result: [Expected outcome]

## Troubleshooting

**Error: [Common error message]**
Cause: [Why it happens]
Solution: [How to fix]

**Error: [Another common error]**
Cause: [Why it happens]
Solution: [How to fix]

## See Also

- [reference/advanced.md](reference/advanced.md) for additional features
- [reference/api.md](reference/api.md) for complete API reference
```

### Content Principles

#### Be Specific and Actionable

```markdown
✗ Bad: "Validate the data before proceeding."

✓ Good: "Run `python scripts/validate.py --input {filename}` 
to check data format. If validation fails, common issues include:
- Missing required fields (add them to the CSV)
- Invalid date formats (use YYYY-MM-DD)
```

#### Don't Over-Explain

Claude already knows:
- What PDFs are
- How libraries work
- Basic programming concepts
- Common industry terms (unless domain-specific)

```markdown
✗ Bad (unnecessary explanation):
"PDF (Portable Document Format) files are a common file format 
that contains text, images, and other content. There are many 
libraries available for PDF processing. We recommend pdfplumber 
because it is easy to use and popular in the Python community..."

✓ Good (concise):
"Use pdfplumber for text extraction:
```python
import pdfplumber
with pdfplumber.open('file.pdf') as pdf:
    text = pdf.pages[0].extract_text()
```
"
```

#### For Critical Operations, Use Scripts Over Language

Anthropic explicitly recommends: "For critical validations, consider bundling a script that performs checks programmatically rather than relying on language instructions. Code is deterministic; language interpretation isn't."

```markdown
✗ Bad (relying on interpretation):
"Make sure the data is valid before saving. Check that numbers 
are reasonable and dates make sense. Use your best judgment."

✓ Good (deterministic validation):
"Run validation: `python scripts/validate_data.py {filename}`
This script checks:
- All required fields are present
- Numbers are within valid ranges (see reference/ranges.md)
- Dates are in YYYY-MM-DD format
- No duplicate entries exist

Only proceed if validation passes."
```

#### Use Feedback Loops

For complex workflows, build in validation:

```markdown
## Document Modification Workflow

1. Make your edits to `word/document.xml`
2. **Validate immediately**: `python ooxml/scripts/validate.py unpacked_dir/`
3. If validation fails:
   - Review the error message carefully
   - Fix the issues in the XML
   - Run validation again
4. **Only proceed when validation passes**
5. Rebuild: `python ooxml/scripts/pack.py unpacked_dir/ output.docx`
```

#### Provide Consistent Terminology

Choose one term and use it throughout:

```markdown
✗ Inconsistent:
"Extract text from the file" (first mention)
"Pull data from the PDF" (second mention)
"Retrieve content from the document" (third mention)

✓ Consistent:
Always use "extract text"
```

---

## 6. Mastering the Description Field

The `description` field is **the most critical component** of your skill. Claude uses it to choose the right skill from potentially 100+ available skills—without loading the full body.

### Why This Matters

If your description is vague or missing key trigger phrases, Claude won't activate your skill even when it would be perfect for the task. This is the #1 reason skills don't activate reliably.

### Description Structure

Write in **three parts**: What + When + How

```yaml
description: >
  [WHAT]: Analyzes Figma design files and generates developer handoff 
  documentation. [WHEN]: Use when user uploads .fig files, asks for 
  "design specs", "component documentation", or "design-to-code handoff". 
  [HOW]: Extracts layers, exports assets, generates accessibility notes.
```

### Essential Elements

| Element | Purpose | Example |
|---|---|---|
| **Action verb** | What the skill does | "Analyze", "Create", "Generate", "Process" |
| **Domain/input type** | What it works with | "Figma files", "financial statements", "CSV data" |
| **Trigger phrases** | How users ask for it (multiple!) | "design specs", "component docs", "handoff" |
| **Key capabilities** | What makes it special | "accessibility notes", "asset export", "annotations" |

### Examples of Strong Descriptions

```yaml
# Example 1: Document Processing
description: >
  Extract and analyze text from PDF documents, fill forms, merge files, 
  and extract tables. Use when working with PDF files, when the user 
  mentions PDFs, forms, document extraction, or when you need to process 
  PDF content.

# Example 2: Project Management
description: >
  Manages Linear project workflows including sprint planning, task 
  creation, and status tracking. Use when user mentions "sprint", 
  "Linear tasks", "project planning", or asks to "create tickets".

# Example 3: Financial Analysis
description: >
  Analyze financial statements and create models with sensitivity analysis. 
  Use when analyzing company financials, creating investment memos, or 
  modeling scenarios.

# Example 4: Brand Application
description: >
  Apply company brand standards including colors, typography, spacing, 
  and tone. Use when creating marketing materials, documents, or 
  presentations, or when user asks to "follow brand guidelines" or 
  "maintain consistency".
```

### Examples of Weak Descriptions

```yaml
✗ "Helps with projects"
  → Too vague, no trigger phrases

✗ "Creates sophisticated multi-page documentation systems"
  → No triggers, doesn't say WHAT it does

✗ "Implements the Project entity model with hierarchical relationships"
  → Too technical, no user-facing triggers

✗ "Document management system"
  → Could mean anything, no actionable triggers
```

### How to Test Your Description

Ask Claude: **"When would you use the [skill name] skill?"**

Claude will quote your description back. If it reads awkwardly or doesn't make sense, revise it. Good descriptions sound natural when read aloud.

### Trigger Phrase Strategy

Include **diverse phrasings** of how users might request your skill:

```yaml
✓ Good (multiple triggers):
"Use when user asks to 'analyze data', 'review the spreadsheet', 
'examine trends', 'create a summary', 'show me insights', or 
'what does this tell us about'."

✗ Bad (single trigger):
"Use for data analysis."
```

### Negative Triggers (Prevent Over-Triggering)

If your skill activates too often, add negative triggers:

```yaml
description: >
  Advanced data analysis for CSV files. Use for statistical modeling, 
  regression, clustering. Do NOT use for simple data exploration 
  (use data-viz skill instead).
```

This helps Claude avoid activating your skill when a simpler one would suffice.

### Common Trigger Categories

Build your triggers around these patterns:

| Category | Examples |
|---|---|
| **Action words** | "analyze", "create", "generate", "process", "review" |
| **File types** | "PDF", "CSV", "Figma file", "GitHub PR" |
| **Tool names** | "Linear", "Figma", "Slack", "GitHub" |
| **User phrases** | "sprint planning", "design handoff", "deploy", "refactor" |
| **Problem domains** | "security review", "performance", "accessibility" |
| **Outcomes** | "create specs", "generate report", "build model" |

---

## 7. YAML Frontmatter Reference

### Complete Frontmatter Template

```yaml
---
# Required fields
name: your-skill-name              # Max 64 chars, kebab-case
description: >                     # Max 1024 chars, what + when + how
  Your skill description here.

# Optional metadata
license: MIT                       # Open source license
compatibility: "Requires network"  # Environment requirements (1-500 chars)
metadata:                          # Custom key-value pairs
  author: Your Name
  version: 1.0.0
  mcp-server: server-name
  category: productivity
  tags: [automation, workflow]
  documentation: https://example.com/docs
  support: support@example.com

# Advanced execution control
context: fork                      # Run in isolated sub-agent
agent: Explore                     # Sub-agent type (Explore, Plan, general-purpose)
disable-model-invocation: true    # Manual invocation only (/skill-name)
user-invocable: false             # Hide from slash command menu
allowed-tools: Read, Glob, Grep   # Restrict available tools
model: claude-opus                # Override default model

# Governance & automation (Claude Code 2.1+)
hooks:                            # Skill-scoped hooks
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/validate.sh"
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "echo 'File written' >> log.txt"
---
```

### Field Definitions

#### Required Fields

**`name`**
- Max 64 characters
- kebab-case only (lowercase, hyphens, no spaces)
- Must match folder name
- Cannot contain "claude" or "anthropic"
- Example: `financial-analysis`, `pdf-processing`, `code-review`

**`description`**
- Max 1,024 characters
- **Must state WHAT the skill does AND WHEN to use it**
- Include diverse trigger phrases
- No XML tags (`< >`)
- Written in third person
- Examples:
  ```yaml
  description: >
    Processes Excel files and generates reports. Use when user asks 
    to analyze data, review a CSV, examine trends, or create a summary.
  ```

#### Optional Metadata Fields

**`license`**
- Specifies open source license
- Examples: `MIT`, `Apache-2.0`, `GPL-3.0`

**`compatibility`**
- Environment requirements (1-500 chars)
- Examples: `"Requires Claude Code with network access"`, `"Works offline"`

**`metadata`**
- Custom key-value pairs for organization
- Useful fields:
  - `author`: Creator name
  - `version`: Semantic version (1.0.0)
  - `mcp-server`: Required MCP server
  - `category`: Skill category
  - `tags`: Array of tags for discovery
  - `documentation`: Link to full docs
  - `support`: Support contact

#### Execution Control Fields

**`context: fork`** (Claude Code 2.1+)
- Run skill in isolated sub-agent
- Sub-agent has own context window and tool access
- Only final result returns to main conversation
- Requires explicit, actionable instructions (see [Context Forking](#12-context-forking--sub-agents))

**`agent`** (with `context: fork`)
- Specify sub-agent type:
  - `Explore`: Optimized for read-only codebase exploration (uses Haiku for efficiency)
  - `Plan`: For planning and analysis
  - `general-purpose`: Full capabilities (default)
  - Custom agent name: Reference custom agents in `.claude/agents/`

**`disable-model-invocation`**
- Set to `true` to prevent automatic activation
- Skill only appears via `/skill-name` slash command
- Useful for skills that should be explicitly invoked

**`user-invocable`**
- Set to `false` to hide from slash command menu
- Skill still activates automatically if relevant
- Useful for internal infrastructure skills

**`allowed-tools`**
- Restrict which tools Claude can use within this skill
- Examples:
  - `Read, Write` (file operations only)
  - `Read, Glob, Grep` (read-only exploration)
  - `Bash(npm:*)` (bash with npm commands only)
  - `Bash` (full bash access)

**`model`**
- Override default Claude model for this skill
- Examples: `claude-opus`, `claude-sonnet`, `claude-haiku`
- Useful if skill needs enhanced reasoning

#### Governance & Hooks (Claude Code 2.1+)

**`hooks`**
- Define skill-scoped hooks for execution control
- Available events:
  - `PreToolUse`: Before a tool executes
  - `PostToolUse`: After a tool completes
  - `Stop`: When skill stops generating
  - `SessionStart`: When session begins
- See [Skill-Scoped Hooks](#11-skill-scoped-hooks--governance) for detailed examples

---

## 8. Instruction Body Best Practices

### Overall Structure

Organize instructions for scannability and logical flow:

```markdown
# Skill Name

## Overview
One-paragraph explanation of what the skill enables.

## Quick Start
The fastest path to success for common use cases.

## Detailed Workflow
Step-by-step instructions for the full process.

## Examples
2-3 concrete examples showing real-world usage.

## Troubleshooting
Common errors and how to fix them.

## Advanced Features
Optional advanced capabilities (with reference links).
```

### Proven Patterns

#### Pattern 1: Sequential Workflow

Use when steps must happen in order:

```markdown
## Workflow: Onboard New Customer

### Step 1: Create Account
Call MCP tool: `create_customer`
Parameters: name, email, company
Expected result: Customer ID returned

### Step 2: Setup Payment
Call MCP tool: `setup_payment_method`
Dependencies: Must have Customer ID from Step 1
Validation: Confirm payment method is verified

### Step 3: Create Subscription
Call MCP tool: `create_subscription`
Parameters: plan_id, customer_id
Expected result: Subscription active

### Step 4: Send Welcome Email
Call MCP tool: `send_email`
Template: welcome_email_template
Result: Confirmation in conversation
```

#### Pattern 2: Decision Trees

Use when the next step depends on conditions:

```markdown
## Smart File Storage – Decision Tree

1. Check file type and size
2. Determine best storage location:
   - Large files (>10MB): Use cloud storage MCP
   - Collaborative docs: Use Notion/Docs MCP
   - Code files: Use GitHub MCP
   - Temporary files: Use local storage
3. Execute storage with appropriate MCP tool
4. Explain to user why that storage was chosen
```

#### Pattern 3: Validation Loops

Use when quality improves with iteration:

```markdown
## Iterative Report Creation

### Initial Draft
1. Fetch data via MCP
2. Generate first draft report
3. Save to temporary file

### Quality Check
1. Run validation script: `scripts/check_report.py`
2. Identify issues (missing sections, formatting, data errors)

### Refinement Loop
1. Address each identified issue
2. Regenerate affected sections
3. Re-validate
4. **Repeat until quality threshold met**

### Finalization
1. Apply final formatting
2. Generate summary
3. Save final version
```

#### Pattern 4: Troubleshooting Checklist

Always include this section:

```markdown
## Troubleshooting

**Issue: Command fails with "not found"**
Cause: Required package not installed
Solution: Run `pip install package-name` first

**Issue: API returns 401 (Unauthorized)**
Cause: Authentication token invalid or expired
Solution: Refresh token using MCP configuration

**Issue: No results returned**
Cause: Query parameters too restrictive
Solution: Broaden filters or check data exists
```

### Content Quality Checklist

For each instruction:
- [ ] Is it specific and actionable?
- [ ] Does it avoid unnecessary explanations?
- [ ] For critical operations, is there a script instead of just language?
- [ ] Are examples concrete, not abstract?
- [ ] Do error messages clearly explain what went wrong?
- [ ] Is terminology consistent throughout?
- [ ] Are reference files properly linked?

### Managing Complexity

**If your SKILL.md exceeds 1,000 lines:**

Use progressive disclosure:

```markdown
# Document Processing

## Core Features

**Text Extraction**: Use pdfplumber for basic extraction.
See [reference/text-extraction.md](reference/text-extraction.md) for details.

**Form Filling**: For complex forms, see [reference/forms.md](reference/forms.md)

**Advanced OOXML**: For low-level XML manipulation, see [reference/ooxml.md](reference/ooxml.md)
```

**If your skill has many error cases:**

Create a separate troubleshooting reference:

```markdown
# Document Processing

See [reference/troubleshooting.md](reference/troubleshooting.md) for common errors and solutions.
```

---

## 9. Advanced Features (Claude Code 2.1+)

Claude Code 2.1 (January 2026) introduced three powerful features that transform skills from instructions into governed behavioral units.

### Feature 1: Skill Hot-Reload

**What it is:** Modify a skill file, save it, and changes take effect immediately—no restart, no session loss.

**Why it matters:**
- **Instant iteration** → Edit SKILL.md, save, test in same session
- **Live debugging** → Observe how Claude interprets instructions in real time
- **No context loss** → Keep conversation history while iterating

**How to use:**
```bash
# Edit ~/.claude/skills/my-skill/SKILL.md or .claude/skills/my-skill/SKILL.md
# Save the file
# Changes are live immediately—no restart needed
```

### Feature 2: Skill-Scoped Hooks (Built-In Governance)

**What it is:** Embed operational rules directly in skill frontmatter. The governance rules travel with the skill.

**Why it matters:**
- **Portable governance** → Share a skill and its safety constraints travel together
- **Deterministic enforcement** → Hooks run validation before Claude makes decisions
- **Composable security** → Different skills can have different security postures

**Example: Safety-Checked Shell Commands**

```yaml
---
name: safe-shell
description: >
  Execute shell commands with automatic safety validation.
  Use when executing shell commands that need security checks.
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/validate-shell.sh"
---

Execute the requested shell operations.
All commands are validated before execution.
```

When Claude tries to run any Bash command:
1. The hook runs `validate-shell.sh`
2. If the script exits with code 2 (dangerous command), execution blocks
3. No negotiation—the hook is deterministic

**Available Hook Events in Frontmatter:**

| Event | When It Fires |
|---|---|
| `PreToolUse` | Before a tool is executed |
| `PostToolUse` | After a tool completes |
| `Stop` | When the skill stops generating |
| `SessionStart` | When a session begins |

See [Skill-Scoped Hooks](#11-skill-scoped-hooks--governance) for detailed configuration.

### Feature 3: Context Forking (Sub-Agent Isolation)

**What it is:** When you invoke a skill with `context: fork`, it spawns an isolated sub-agent with its own context, tools, and conversation history. Only the final result returns.

**Why it matters:**
- **Isolated execution** → Internal reasoning doesn't clutter main conversation
- **Token budget separation** → Sub-agent has its own context window
- **Tool scoping** → Sub-agent can have restricted tool access
- **Parallel processing** → Multiple sub-agents can run independently

**Example: Deep Code Review (Isolated)**

```yaml
---
name: deep-review
description: >
  Comprehensive codebase analysis with thorough exploration.
  Use for deep code reviews or architectural analysis.
context: fork
agent: Explore
allowed-tools: Read, Glob, Grep
---

Research the codebase thoroughly:

## Step 1: File Discovery
Use Glob and Grep to locate relevant files.

## Step 2: Analysis
Read and analyze code structure for:
- Architectural patterns
- Potential issues
- Anti-patterns

## Step 3: Summary
Provide findings with specific file references.
```

When invoked:
1. Sub-agent spawns with `Explore` configuration
2. Sub-agent can only use Read, Glob, Grep
3. Sub-agent explores codebase independently
4. Only the summary returns to main conversation

### Performance Notes

**Hot-reload** adds minimal overhead—safe to use during development.

**Hooks** impact performance proportional to their frequency:
- `PreToolUse`/`PostToolUse` hooks run for every tool call
- Keep hook scripts fast (<100ms ideal)
- Avoid network calls in hooks if possible

**Context forking** trades off main conversation context for sub-agent isolation:
- Use when you need deep exploration (saves main context)
- Don't use when you need tight coupling with main conversation

---

## 10. Progressive Disclosure & Information Architecture

Progressive disclosure is how skills stay lightweight while remaining powerful.

### The Three Levels, Revisited

```
Level 1 (Always Loads): 300 tokens
├─ name: your-skill
├─ description: Analyze financial statements...
├─ metadata: version, author, category

Level 2 (On Demand): +400 tokens
├─ SKILL.md body (main instructions)
├─ Examples
└─ Troubleshooting

Level 3 (On Demand): +200-500 tokens per file
├─ reference/advanced.md
├─ reference/api.md
└─ reference/examples.md
```

With this structure, 10 skills with separate reference docs cost:
- Without progressive disclosure: 10 × 2000+ tokens = 20,000+ tokens
- With progressive disclosure: (10 × 300) + (1-2 × 600) = 4,200 tokens

### How to Design Progressive Disclosure

**Step 1: Identify Core vs. Advanced**

```
Core (in SKILL.md):
- Essential workflow
- Common use cases
- Basic examples
- Quick troubleshooting

Advanced (in references/):
- Detailed specifications
- Complex scenarios
- Performance tuning
- Complete error catalog
```

**Step 2: Structure Reference Files**

Keep reference files organized by topic:

```
my-skill/
├── SKILL.md
├── references/
│   ├── quick-reference.md     (1-page cheat sheet)
│   ├── api-complete.md        (full API docs)
│   ├── advanced-patterns.md   (complex scenarios)
│   └── troubleshooting.md     (all errors)
```

**Step 3: Link, Don't Inline**

In SKILL.md, use links instead of including full content:

```markdown
# My Skill

## Basic Usage
[instructions here]

## API Reference
For complete API documentation, see [references/api-complete.md](references/api-complete.md)

## Advanced Patterns
For complex use cases, see [references/advanced-patterns.md](references/advanced-patterns.md)

## Troubleshooting
See [references/troubleshooting.md](references/troubleshooting.md) for error resolution
```

Claude will load these reference files only when needed.

**Step 4: Make Reference Files Discoverable**

Add a table of contents to long reference files:

```markdown
# API Reference

## Contents
- [Core Endpoints](#core-endpoints)
- [Authentication](#authentication)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)

## Core Endpoints

### GET /data
[details]
```

This helps Claude find the right section quickly.

### Progressive Disclosure Patterns

**Pattern 1: Quick Start + Advanced**

```markdown
# My Skill

## Quick Start (for 80% of use cases)
[simple, common workflow]

## Advanced Configuration
For configuration options, see [references/config.md](references/config.md)

## Performance Tuning
For optimization details, see [references/performance.md](references/performance.md)
```

**Pattern 2: Common Errors + Complete Catalog**

```markdown
# My Skill

## Common Errors (inline)
**Error: Connection timeout**
Cause: Network issue
Solution: Check internet connection

## Complete Error Catalog
For all possible errors, see [references/errors.md](references/errors.md)
```

**Pattern 3: Guides by Complexity**

```markdown
# My Skill

## Basics
[simple usage for new users]

## Intermediate
See [references/workflows.md](references/workflows.md) for step-by-step workflows

## Expert
See [references/advanced.md](references/advanced.md) for advanced patterns

## API Reference
See [references/api.md](references/api.md) for complete API
```

### Rules for File Organization

1. **Keep reference files focused** → Each file covers one topic
2. **One level deep** → Avoid `references/advanced/details/info.md`; use `references/advanced-details.md` instead
3. **Don't duplicate** → Information lives in one place, referenced from others
4. **Make files self-contained** → Each reference file should work standalone

### When to Create Reference Files

Create a reference file when:
- Content exceeds 200 lines
- Information isn't needed for typical usage
- Readers will search for specific sections
- The content could be reused in other skills or contexts

Don't create a reference file if:
- Content is under 100 lines
- It's essential for basic usage
- It's a single example or error case

---

## 11. Skill-Scoped Hooks & Governance

Hooks allow you to embed governance, validation, and automation directly in your skill.

### How Hooks Work

A hook is a trigger + action pattern:

```yaml
hooks:
  [Event]:
    - matcher: "[Tool Name]"
      hooks:
        - type: command
          command: "[Script Path]"
```

When `[Event]` fires for `[Tool Name]`, run the script at `[Script Path]`.

### Available Events

| Event | When It Fires | Use Cases |
|---|---|---|
| `PreToolUse` | Before a tool executes | Validation, permission checks, logging |
| `PostToolUse` | After a tool completes | Verification, cleanup, notifications |
| `Stop` | Skill stops generating | Final cleanup, reporting |
| `SessionStart` | Session begins | Initialization, setup |

### Complete Hook Example

```yaml
---
name: database-operations
description: >
  Safely execute database operations with validation and audit logging.
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/validate-sql.sh"
  PostToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/audit-log.sh"
---

Execute database operations safely.
All queries are validated before execution.
All operations are logged for audit.
```

**Script: scripts/validate-sql.sh**
```bash
#!/bin/bash
# Validate SQL before execution

COMMAND="$1"

# Block dangerous operations
if [[ $COMMAND =~ DROP|DELETE|TRUNCATE ]]; then
  echo "Dangerous operation detected: $COMMAND" >&2
  exit 2  # Exit code 2 blocks execution
fi

exit 0  # Allow execution
```

### Advanced Hook Features (2.1+)

**`once: true` Configuration**

Run a hook exactly once:

```yaml
hooks:
  SessionStart:
    - matcher: "*"
      once: true
      hooks:
        - type: command
          command: "scripts/initialize.sh"
```

**PreToolUse with Permission Decisions**

Hooks can modify inputs and request permission:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "scripts/check-permission.sh"
          # Hook can return updatedInput
          # Claude still asks for user consent
```

### Hook Script Best Practices

**Script Quality:**
- Keep under 100ms execution time
- Exit with code 0 (allow) or 2 (block)
- Write errors to stderr, not stdout
- Log important events (use `>>` for append)

**Example: Good Hook Script**

```bash
#!/bin/bash
# Validate database operations

# Extract operation type
OPERATION=$(echo "$1" | head -c 10)

# Block destructive operations on production
if [[ "$OPERATION" == "DROP" ]] || [[ "$OPERATION" == "DELETE" ]]; then
  echo "ERROR: Destructive operation blocked" >&2
  exit 2
fi

# Log the operation
echo "$(date): Operation allowed - $OPERATION" >> ~/.claude/logs/db.log

exit 0
```

**Example: Bad Hook Script**

```bash
#!/bin/bash
# Don't do this:

# Too slow (network call in hook)
curl -s "https://example.com/validate" -d "$1"

# Ambiguous (returns data instead of exit code)
echo "maybe"

# Blocks everything (too restrictive)
exit 2
```

### Using `${CLAUDE_PLUGIN_ROOT}`

This variable contains the absolute path to your skill directory:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/validate.sh"
```

On a user's machine:
- Linux/macOS: `/Users/alice/.claude/skills/my-skill`
- Windows: `C:\Users\alice\.claude\skills\my-skill`

The variable ensures paths work regardless of where the skill is installed.

---

## 12. Context Forking & Sub-Agents

Context forking (Claude Code 2.1+) allows a skill to spawn an isolated sub-agent.

### How Context Forking Works

```yaml
---
name: deep-analysis
context: fork
agent: Explore
allowed-tools: Read, Glob, Grep
---

Analyze the codebase thoroughly.
```

When invoked:

1. **Main agent** receives user's request
2. **Sub-agent spawns** with isolated context
3. **Sub-agent executes** the skill independently
4. **Only result returns** to main agent

### Benefits

| Benefit | Why It Matters |
|---|---|
| **Isolation** | Sub-agent's exploration doesn't clutter main conversation |
| **Tool scoping** | Sub-agent can have restricted tool access |
| **Token budget** | Sub-agent has its own context window |
| **Parallel processing** | Multiple sub-agents can run independently |

### Sub-Agent Types

| Type | Best For | Model | Available Tools |
|---|---|---|---|
| **Explore** | Read-only codebase analysis | Haiku (efficient) | Read, Glob, Grep |
| **Plan** | Planning and analysis tasks | Sonnet | Read, Bash |
| **general-purpose** | Full capabilities | Opus | All tools |
| **Custom** | Domain-specific agents | Configurable | Configurable |

### Important Limitation

**Known issue (GitHub #17283):** `context: fork` and `agent:` fields are **ignored when a skill is invoked via the Skill tool** (programmatic/auto-invocation).

The skill runs in the main conversation instead.

**Workaround:** For reliable forking, define the skill as a custom agent in `.claude/agents/` instead.

**Currently works:**
- Explicit `/skill-name` slash command invocation ✓

**Doesn't work:**
- Automatic semantic activation
- Programmatic Skill tool calls

### Example: Isolated Code Review

```yaml
---
name: deep-code-review
description: >
  Comprehensive code analysis with deep exploration.
  Use for thorough code reviews, architecture analysis, 
  or when you need detailed findings.
context: fork
agent: Explore
allowed-tools: Read, Glob, Grep
---

# Deep Code Review

## Phase 1: Discovery
Use Glob and Grep to find all relevant files:
1. Locate source code files
2. Identify test files
3. Find configuration files

## Phase 2: Analysis
Read and analyze for:
- Architectural patterns
- Code smells
- Performance issues
- Security concerns

## Phase 3: Summary
Provide comprehensive findings with:
- Specific file references
- Actionable recommendations
- Examples of issues found
```

When a user asks for a deep code review, the skill:
1. Spawns a sub-agent with Explore configuration
2. Sub-agent uses only Read, Glob, Grep tools
3. Sub-agent explores codebase thoroughly
4. Main conversation sees only the final summary

---

## 13. MCP Integration Patterns

Skills and MCP servers are **complementary**, not redundant.

### The Kitchen Analogy

- **MCP provides the professional kitchen** → Access to tools, ingredients, equipment (connectivity)
- **Skills provide the recipes** → Step-by-step instructions on how to create something valuable (knowledge)

| MCP (Connectivity) | Skills (Knowledge) |
|---|---|
| Connects Claude to your service | Teaches Claude how to use your service effectively |
| Provides real-time data access | Captures workflows and best practices |
| **What** Claude can do | **How** Claude should do it |

### Why MCP + Skills Matter

**Without skills:** Users connect your MCP but don't know what to do next. Support tickets pile up. Results are inconsistent because users prompt differently each time.

**With skills:** Pre-built workflows activate automatically. Consistent tool usage. Best practices embedded in every interaction.

### Multi-MCP Orchestration Pattern

Skills coordinate across multiple MCP servers:

```markdown
# Design-to-Development Handoff

## Phase 1: Design Export (Figma MCP)
1. Export design assets from Figma
2. Generate design specifications
3. Create asset manifest

## Phase 2: Asset Storage (Drive MCP)
1. Create project folder in Drive
2. Upload all assets
3. Generate shareable links

## Phase 3: Task Creation (Linear MCP)
1. Create development tasks
2. Attach asset links to tasks
3. Assign to engineering team

## Phase 4: Notification (Slack MCP)
1. Post handoff summary to #engineering
2. Include asset links and task references
```

### MCP Tool Naming in Skills

Always use **fully qualified names** to avoid "tool not found" errors:

```markdown
✓ Use the `Linear:create_issue` tool
✓ Use the `Slack:post_message` tool
✓ Use the `GitHub:create_pull_request` tool

✗ Use the `create_issue` tool
✗ Use the `post_message` tool
```

Format: `ServerName:tool_name` (case-sensitive)

### Error Handling for MCP Tools

Include common MCP errors in troubleshooting:

```markdown
## Troubleshooting

**Error: MCP server not connected**
Cause: Service hasn't been authenticated
Solution: Connect in Settings > Extensions > [Service]

**Error: Authentication failed (401)**
Cause: API key expired or invalid
Solution: Refresh credentials in Settings

**Error: Tool not found**
Cause: Tool name misspelled or server not available
Solution: Verify tool name is correct format: `ServerName:tool_name`

**Error: Rate limit exceeded**
Cause: Too many requests to service
Solution: Wait 1 minute before retrying
```

### Skill Design for MCP Enhancement

When designing a skill around an MCP:

**Do:**
- Provide workflow guidance (how to use the tool effectively)
- Include domain expertise (business logic, best practices)
- Add validation and error handling
- Coordinate multiple tool calls
- Provide examples specific to user's domain

**Don't:**
- Just repeat what the tool already does
- Assume users know all tool capabilities
- Leave error handling to the user
- Skip troubleshooting guidance
- Ignore edge cases

---

## 14. Common Workflow Patterns

These patterns emerge from real-world skill development.

### Pattern 1: Sequential Workflow with Validation

Use when steps must happen in specific order:

```markdown
# Customer Onboarding

## Step 1: Validate Input
Check that all required fields are provided:
- Customer name
- Email address
- Company name

## Step 2: Create Account
Run: `mcp-tool create_customer --name "$NAME" --email "$EMAIL"`
Verify: Confirm account created with ID returned

## Step 3: Setup Payment
Run: `mcp-tool setup_payment --customer-id "$CUSTOMER_ID"`
Verify: Payment method successfully added

## Step 4: Send Confirmation
Run: `mcp-tool send_email --template welcome --to "$EMAIL"`
Result: Welcome email sent
```

### Pattern 2: Conditional Execution (Decision Tree)

Use when next step depends on condition:

```markdown
# Smart Cache Strategy

1. Check file size
2. Decide strategy:
   - Small files (<1MB): Keep in memory
   - Medium files (1-100MB): Cache to disk
   - Large files (>100MB): Stream from source
3. Execute appropriate caching strategy
4. Log caching decision for audit
```

### Pattern 3: Iterative Improvement

Use for tasks that improve with iteration:

```markdown
# Report Generation

### Iteration 1: Draft
- Fetch data
- Generate initial report
- Save draft

### Quality Check
- Validate structure
- Check for missing sections
- Review data accuracy

### Iteration Loop
- Fix identified issues
- Regenerate affected sections
- Re-validate
- Repeat until quality threshold met

### Finalization
- Apply formatting
- Generate final version
- Archive draft versions
```

### Pattern 4: Domain-Specific Intelligence

Use when skill adds expertise beyond tool access:

```markdown
# Payment Processing with Compliance

## Compliance Check (before processing)
1. Fetch transaction details
2. Apply compliance rules:
   - Check sanctions lists
   - Verify jurisdiction allowances
   - Assess risk level
3. Document compliance decision

## Processing Decision
IF compliance passed:
  - Process transaction
  - Apply fraud checks
  - Execute payment
ELSE:
  - Flag for review
  - Create compliance case
  - Notify admin

## Audit Trail
- Log all compliance checks
- Record processing decisions
- Generate audit report
```

### Pattern 5: Error Recovery with Fallback

Use when primary approach might fail:

```markdown
# Robust Data Export

## Primary Approach (Fast)
- Export via API
- Validate result
- Return

## Fallback 1 (if API fails)
- Export via direct database query
- Validate result
- Return

## Fallback 2 (if database fails)
- Export via CSV export tool
- Validate result
- Return

## Error Handling
If all methods fail:
1. Log the failure with details
2. Notify user of the issue
3. Suggest manual alternatives
```

---

## 15. Testing & Iteration

### Three Levels of Testing Rigor

| Approach | Best For | Effort |
|---|---|---|
| **Manual testing** | Fast iteration, development | Low |
| **Scripted testing** | Repeatable validation | Medium |
| **Programmatic testing** | Systematic evaluation suites | High |

### Manual Testing Workflow

1. **Test triggering** → Does the skill activate when it should?
   ```
   User: "Help me analyze this financial data"
   Expected: financial-analysis skill activates
   ```

2. **Test functionality** → Does the skill produce correct outputs?
   ```
   Skill receives: revenue data for Q1-Q4
   Expected: Complete analysis with trends and projections
   ```

3. **Test error handling** → Does the skill gracefully handle failures?
   ```
   Skill receives: malformed data
   Expected: Clear error message + recovery instructions
   ```

### Evaluating Triggering

Create 10-20 test queries covering:

**Should trigger:**
```
- "Help me analyze our Q4 financial results"
- "Create a budget projection for next year"
- "Review our expense trends"
- "Compare our performance to competitors"
```

**Should NOT trigger:**
```
- "What's the weather in San Francisco?"
- "Help me write Python code"
- "How do I bake cookies?"
```

Ask Claude: *"When would you use the [skill name] skill?"* and see if the answer matches your expectations.

### Evaluating Functionality

Test the actual workflow:

```
Test: Create budget with 5 categories and $10K per category
Given: Budget parameters (categories, amounts)
When: Skill executes workflow
Then:
  - Budget created in system
  - All categories configured
  - Total amount correct
  - No API errors
```

**Performance comparison:**

Without skill:
- 15 back-and-forth messages
- 3 failed API calls
- 12,000 tokens

With skill:
- 2 clarifying questions
- 0 failed API calls
- 6,000 tokens

### Success Criteria

**Quantitative targets:**
- Skill triggers on 80-90% of relevant queries
- Completes workflow in expected number of tool calls
- 0 failed API calls per workflow
- Context usage reduced by 30-50%

**Qualitative targets:**
- Users don't need to prompt Claude about next steps
- Workflows complete without user correction
- Consistent results across sessions
- New users succeed on first try

### Iteration Based on Feedback

| Signal | What It Means | How to Fix |
|---|---|---|
| Skill never activates | Description too vague or missing triggers | Add more detail; include diverse trigger phrases |
| Skill activates too often | Description too broad | Be more specific; add negative triggers |
| Results inconsistent | Instructions ambiguous | Add examples; be more specific |
| Tool calls fail | Missing error handling | Add validation steps; improve MCP tool calls |
| Users skip steps | Instructions unclear | Clarify with examples; add validation checks |

---

## 16. Troubleshooting & Common Pitfalls

### Skill Won't Load

| Symptom | Cause | Fix |
|---|---|---|
| "SKILL.md not found" | Wrong filename (SKILL.MD, skill.md, etc.) | Rename to exactly `SKILL.md` (case-sensitive) |
| "Invalid frontmatter" | YAML formatting error | Check `---` delimiters, closed quotes, no XML tags |
| "Invalid skill name" | Name has spaces, capitals, special chars | Use kebab-case: `my-cool-skill` |
| "Reserved word error" | Name contains "claude" or "anthropic" | Use different name |

**Verification:**
```bash
ls -la ~/.claude/skills/my-skill/SKILL.md
# Should show: SKILL.md (exactly)
```

### Skill Doesn't Trigger

**Debugging checklist:**

1. Is the description specific enough?
   ```yaml
   ✗ "Helps with projects"
   ✓ "Creates and manages project plans with Asana integration"
   ```

2. Does it include user-facing trigger phrases?
   ```yaml
   ✗ "Use for sprint planning"
   ✓ "Use when asked to 'plan a sprint', 'create tasks', 'organize backlog'"
   ```

3. Is it too broad (over-triggering)?
   ```yaml
   ✗ "Helps with files" (triggers for everything)
   ✓ "Processes PDF files and extracts data"
   ```

4. Test manually:
   ```
   Ask Claude: "When would you use the [skill-name] skill?"
   Claude should quote your description back.
   If it sounds awkward or incomplete, revise it.
   ```

### Instructions Not Followed

| Problem | Fix |
|---|---|
| Instructions too verbose | Keep concise; move detail to `references/` |
| Critical steps skipped | Put critical instructions at top; use `## Critical` headers |
| Ambiguous language | Be specific; use examples |
| Inconsistent results | Add validation scripts; be more explicit |

### MCP Tool Issues

1. **Verify MCP is connected:**
   ```
   Settings > Extensions > [Your Service]
   Is it connected and authenticated?
   ```

2. **Test MCP independently:**
   ```
   Ask Claude: "Use [Service] MCP to fetch my data"
   If this fails, MCP isn't working (not skill problem)
   ```

3. **Check tool names:**
   - Must be exact format: `ServerName:tool_name`
   - Case-sensitive
   - Verify in MCP documentation

### Common Anti-Patterns to Avoid

```yaml
✗ Don't offer too many options:
  "You can use pypdf, pdfplumber, PyMuPDF, pdf2image..."

✓ Do provide default with escape hatch:
  "Use pdfplumber for text extraction. For scanned PDFs, use pytesseract."
```

```markdown
✗ Don't use Windows paths:
  instructions/step.md (wrong: backslashes)

✓ Do use forward slashes:
  instructions/step.md (right: works everywhere)
```

```markdown
✗ Don't assume tools are installed:
  "Use the pdf library"

✓ Do list dependencies:
  "Install first: pip install pypdf
   Then: from pypdf import PdfReader"
```

```yaml
✗ Don't embed vague instructions:
  "Validate things properly"

✓ Do use scripts for validation:
  "Run: python scripts/validate.py --input data.csv"
```

---

## 17. Distribution & Sharing

### Where Skill Files Live

| Scope | Location | Shared? |
|---|---|---|
| **Personal** | `~/.claude/skills/` | No—just your machine |
| **Project** | `.claude/skills/` (in repo) | Yes—with team |
| **Enterprise** | Managed globally | Yes—organization-wide |

### Distributing Skills

**Option 1: Direct Download**
- Zip the skill folder
- Share the .zip file
- Users extract to `~/.claude/skills/` or `.claude/skills/`

**Option 2: GitHub Repository**
- Create a public repo
- Host skills in a `skills/` directory
- Users clone and copy to their skills folder

**Option 3: Organization Deployment** (Claude Code 2.1+)
- Admins deploy skills workspace-wide
- Automatic updates
- Centralized management

### Sharing Checklist

Before distributing:
- [ ] README at repo level (not inside skill folder)
- [ ] Clear installation instructions (both Claude.ai and Claude Code)
- [ ] SKILL.md is well-written and tested
- [ ] Reference files are organized
- [ ] Examples are concrete and real-world
- [ ] Troubleshooting section is comprehensive
- [ ] Version number in metadata (semantic versioning)
- [ ] License clearly specified

### Positioning Your Skill

Focus on **outcomes**, not features:

```markdown
✓ "The ProjectHub skill enables teams to set up complete project 
  workspaces in seconds—including pages, databases, and templates—
  instead of spending 30 minutes on manual setup."

✗ "The ProjectHub skill is a folder containing YAML frontmatter 
  and Markdown instructions that calls our MCP server tools."
```

---

## 18. Quick Checklists

### Pre-Creation Checklist

Before you start building:

- [ ] Identified 2-3 concrete use cases
- [ ] Determined what tools are needed (built-in or MCP)
- [ ] Planned the workflow (sequential, decision tree, iterative?)
- [ ] Researched similar existing skills

### During Development Checklist

As you build:

- [ ] Folder named in kebab-case (`my-skill`)
- [ ] `SKILL.md` exists (exact spelling, case-sensitive)
- [ ] YAML frontmatter has `---` delimiters
- [ ] No XML tags (`< >`) in frontmatter
- [ ] `name` field matches folder name
- [ ] `description` includes WHAT and WHEN
- [ ] Instructions are clear and actionable
- [ ] Examples are concrete and real-world
- [ ] Error cases covered in troubleshooting
- [ ] Reference files linked properly
- [ ] SKILL.md under 5,000 words
- [ ] Consistent terminology throughout

### Testing Checklist

Before sharing:

- [ ] Tested triggering on obvious requests
- [ ] Tested on paraphrased requests
- [ ] Verified doesn't trigger on unrelated topics
- [ ] Functional tests pass
- [ ] Tool integration works (if applicable)
- [ ] Error handling tested
- [ ] Performance acceptable

### Pre-Upload Checklist

Before distribution:

- [ ] Tested in real conversations
- [ ] No hardcoded absolute paths
- [ ] All dependencies listed
- [ ] MCP tool names verified
- [ ] Hooks tested (if using)
- [ ] README created (if GitHub)
- [ ] Installation instructions clear
- [ ] Version number in metadata
- [ ] License specified

### Maintenance Checklist

After release:

- [ ] Monitor user feedback
- [ ] Track activation rate (triggering correctly?)
- [ ] Fix reported bugs promptly
- [ ] Update documentation for improvements
- [ ] Test with new Claude Code versions
- [ ] Consider 2.1 features (hooks, context fork)

---

## Complete Frontmatter Template (Copy-Paste Ready)

```yaml
---
# REQUIRED
name: your-skill-name
description: >
  What it does. Use when [trigger phrases].

# OPTIONAL METADATA
license: MIT
compatibility: "Requires Claude Code with network access"
metadata:
  author: Your Name
  version: 1.0.0
  mcp-server: server-name
  category: productivity
  tags: [automation, workflow]
  documentation: https://example.com/docs
  support: support@example.com

# OPTIONAL EXECUTION CONTROL
context: fork
agent: Explore
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Bash
model: claude-sonnet

# OPTIONAL GOVERNANCE (2.1+)
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/validate.sh"
---
```

---

## Troubleshooting Decision Tree

```
Skill isn't working?

├─ Does SKILL.md exist at root? (exact name, case-sensitive)
│  ├─ NO → Create it: SKILL.md
│  └─ YES → Check frontmatter
│
├─ Is frontmatter valid YAML? (check --- delimiters, quotes)
│  ├─ NO → Fix syntax
│  └─ YES → Check skill naming
│
├─ Is name in kebab-case? (my-skill, not My-Skill)
│  ├─ NO → Rename folder and `name:` field
│  └─ YES → Check description
│
├─ Is description specific with trigger phrases?
│  ├─ NO → Rewrite: "[WHAT] Use when [trigger phrases]"
│  └─ YES → Check activation manually
│
├─ Test: Ask Claude "When would you use this skill?"
│  ├─ Claude quotes back awkwardly → Rewrite description
│  ├─ Claude doesn't know about it → Check file paths
│  └─ Claude quotes it perfectly → Instructions issue?
│
└─ Check instructions for clarity
   ├─ Too vague? → Add specifics and examples
   ├─ Skipping steps? → Verify instructions
   └─ Tool errors? → Check MCP connection
```

---

*This comprehensive guide merges Anthropic's official design principles, Claude Code 2.1 advanced features, and real-world skill development patterns. Version: February 2026.*

