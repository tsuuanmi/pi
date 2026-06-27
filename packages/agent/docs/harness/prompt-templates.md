# Prompt Templates

Reusable slash-command prompts loaded from markdown files with frontmatter.

## `loadPromptTemplates()`

```typescript
async function loadPromptTemplates(options: {
  cwd: string;
  agentDir: string;
}): Promise<PromptTemplateLoadResult>
```

Loads prompt templates from `agentDir/prompts/` and project `.pi/prompts/` directories. Each `.md` file becomes a template with frontmatter metadata.

## `PromptTemplate`

```typescript
interface PromptTemplate {
  name: string;
  description?: string;
  content: string;
  source: string;
  sourcePath?: string;
}
```

## Template File Format

```markdown
---
name: example
description: An example prompt template
---
Your prompt content here. Args are substituted with {{0}}, {{1}}, etc.
```

## Template Invocation

- `parseCommandArgs(argsString)` — Parse slash-command arguments string into an array
- `substituteArgs(content, args)` — Replace `{{0}}`, `{{1}}`, etc. with provided arguments
- `formatPromptTemplateInvocation(template, args)` — Format a template invocation string