# AGENTS.md

This file contains essential information for AI coding agents working on the Claudian project.

## Project Overview

**Claudian** is an Obsidian plugin that embeds Claude Code as a sidebar chat interface. The vault directory becomes Claude's working directory, giving it full agentic capabilities: file read/write, bash commands, and multi-step workflows.

- **Name**: Claudian
- **Version**: 1.3.70
- **License**: MIT
- **Author**: Yishen Tu
- **Min Obsidian Version**: 1.4.5 (Desktop only)

## Technology Stack

| Category | Technology |
|----------|------------|
| **Language** | TypeScript 5.0+ |
| **Build Tool** | esbuild 0.27+ |
| **Testing** | Jest 30.2+ with ts-jest |
| **Linting** | ESLint 8.57+ with @typescript-eslint |
| **CSS** | Modular CSS (custom build system) |
| **Key Dependencies** | @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk |
| **Target** | ES2018, CommonJS format |

## Project Structure

```
src/
├── main.ts                      # Plugin entry point (ClaudianPlugin class)
├── core/                        # Core infrastructure (no feature deps)
│   ├── agent/                   # Claude Agent SDK wrapper (ClaudianService)
│   ├── agents/                  # Custom agent management (AgentManager)
│   ├── commands/                # Slash command management
│   ├── hooks/                   # PreToolUse/PostToolUse hooks
│   ├── images/                  # Image caching and loading
│   ├── mcp/                     # MCP server config, service, testing
│   ├── plugins/                 # Claude Code plugin discovery/management
│   ├── prompts/                 # System prompts for agents
│   ├── sdk/                     # SDK message transformation
│   ├── security/                # Approval, blocklist, path validation
│   ├── storage/                 # Distributed storage system
│   ├── tools/                   # Tool constants and utilities
│   └── types/                   # Type definitions
├── features/                    # Feature modules
│   ├── chat/                    # Main sidebar view + UI, rendering, controllers, tabs
│   ├── inline-edit/             # Inline edit service + UI (InlineEditModal)
│   └── settings/                # Settings tab UI
├── shared/                      # Shared UI components and modals
│   ├── components/              # Dropdowns, selection highlight
│   ├── mention/                 # @-mention dropdown controller
│   ├── modals/                  # Instruction modal, Confirm modal, Fork target modal
│   └── icons.ts                 # Shared SVG icons
├── i18n/                        # Internationalization (10 locales)
│   └── locales/                 # de, en, es, fr, ja, ko, pt, ru, zh-CN, zh-TW
├── utils/                       # Modular utility functions
└── style/                       # Modular CSS (→ styles.css)
```

### Layer Architecture

| Layer | Purpose | Import Rules |
|-------|---------|--------------|
| **core** | Infrastructure, no feature dependencies | Must NOT import from features/, shared/ |
| **features/** | Feature-specific code | Can import from core/, shared/, utils/ |
| **shared/** | Reusable UI components | Can import from core/, utils/ |
| **utils/** | Utility functions | Must NOT import from features/, shared/ |
| **i18n/** | Internationalization | Standalone |

## Build and Development Commands

```bash
# Development (watch mode with auto-copy to Obsidian)
npm run dev

# Production build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test                    # Run all tests
npm run test:watch              # Run tests in watch mode
npm run test:coverage           # Run tests with coverage
npm run test -- --selectProjects unit        # Unit tests only
npm run test -- --selectProjects integration # Integration tests only

# CSS build (runs automatically with dev/build)
npm run build:css
```

### Development Setup

1. Copy `.env.local.example` to `.env.local`
2. Set `OBSIDIAN_VAULT=/path/to/your/vault` for auto-copy during development
3. Run `npm install`
4. Run `npm run dev`

## Code Style Guidelines

### TypeScript

- **Target**: ES2018, CommonJS format
- **Module resolution**: Node with path aliases (`@/*` → `src/*`)
- **Strict null checks**: Enabled
- **No implicit any**: Enabled

### Import Rules

```typescript
// Use type imports for types
import type { SomeType } from './module';

// Sort imports (enforced by ESLint simple-import-sort)
// 1. Side effects (e.g., 'obsidian')
// 2. External modules
// 3. Internal aliases (@/*)
// 4. Relative imports
// 5. Type imports
```

### Comment Style

- **Only comment WHY, not WHAT**
- No JSDoc that restates the function name
- No narrating inline comments (`// Create the channel` before `new Channel()`)
- No module-level docs on barrel `index.ts` files
- Keep JSDoc only when it adds non-obvious context (edge cases, constraints, surprising behavior)

### ESLint Restrictions

Core modules (`src/core/`) MUST NOT import UI modules:
- Cannot import from `./ui`, `./ui/*`, `../ui`, `../ui/*`
- Cannot import from `./ClaudianView`, `../ClaudianView`

## Testing Strategy

### Test Structure

Tests mirror the `src/` structure:
- `tests/unit/` - Unit tests with mocked dependencies
- `tests/integration/` - Integration tests
- `tests/__mocks__/` - Mock implementations for obsidian and claude-agent-sdk

### Running Tests

```bash
# Run specific test file
npm run test -- --testPathPattern ClaudianService

# Run with watch mode for specific project
npm run test -- --selectProjects unit --watch
```

### TDD Workflow

For new functions/modules and bug fixes, follow red-green-refactor:

1. Write a failing test first in the mirrored path under `tests/unit/`
2. Run it with `npm run test -- --selectProjects unit --testPathPattern <pattern>` to confirm it fails
3. Write the minimal implementation to make it pass
4. Refactor, keeping tests green

**Exceptions**: Skip TDD for trivial changes (renaming, moving files, config tweaks) — but still verify existing tests pass.

### Test Environment

- **Unit tests**: Node environment with jsdom for DOM testing
- **Integration tests**: Full integration with real SDK interactions
- **Coverage**: Collected from `src/**/*.ts`, output to `coverage/` directory

## Architecture Principles

### SDK-First Approach

Proactively use native Claude SDK features over custom implementations. If the SDK provides a capability, use it — do not reinvent it. This ensures compatibility with Claude Code.

### SDK Exploration

When developing SDK-related features:
1. Write a throwaway test script in `dev/` that calls the real SDK
2. Observe actual response shapes, event sequences, and edge cases
3. Inspect files in `~/.claude/` or `{vault}/.claude/` to understand patterns
4. Run this BEFORE writing implementation or tests

### No Console in Production

- Use Obsidian's notification system if user should be notified
- Use `console.log` for debugging, but remove it before committing

## Storage and Data

### File Locations

| File | Contents |
|------|----------|
| `.claude/settings.json` | CC-compatible: permissions, env, enabledPlugins |
| `.claude/claudian-settings.json` | Claudian-specific settings (model, UI, etc.) |
| `.claude/settings.local.json` | Local overrides (gitignored) |
| `.claude/mcp.json` | MCP server configs |
| `.claude/commands/*.md` | Slash commands (YAML frontmatter) |
| `.claude/agents/*.md` | Custom agents (YAML frontmatter) |
| `.claude/skills/*/SKILL.md` | Skill definitions |
| `.claude/sessions/*.meta.json` | Session metadata |
| `~/.claude/projects/{vault}/*.jsonl` | SDK-native session messages |

### Data Flow

1. **Plugin Load**: `main.ts` → `loadSettings()` → `StorageService.initialize()`
2. **Conversations**: Stored as metadata files, messages in SDK storage
3. **Settings**: Split between CC-compatible and Claudian-specific files
4. **Migration**: Handled by `StorageService` on initialization

## CSS Conventions

### Structure

CSS is modular in `src/style/` and built to root `styles.css`:

```
src/style/
├── base/           # container, animations, variables
├── components/     # header, history, messages, code, thinking, etc.
├── toolbar/        # model-selector, permission-toggle, etc.
├── features/       # file-context, inline-edit, diff, etc.
├── modals/         # instruction, mcp-modal, fork-target
├── settings/       # base, env-snippets, slash-settings, etc.
├── accessibility.css
└── index.css       # Build order (@import list)
```

### Naming Conventions

- **Prefix**: All classes use `.claudian-` prefix
- **BEM-lite**: `.claudian-{block}`, `.claudian-{block}-{element}`, `.claudian-{block}--{modifier}`
- **No `!important`**: Avoid unless overriding Obsidian defaults
- **CSS variables**: Use Obsidian's `--background-*`, `--text-*`, `--interactive-*` tokens

### Adding New CSS

1. Create module in appropriate subdirectory
2. Register in `src/style/index.css` via `@import`
3. Run `npm run build:css` or let `npm run dev` handle it

## Security Considerations

### Permission Modes

- **YOLO mode**: No approval prompts; all tool calls execute automatically (default)
- **Safe mode**: Approval prompt per tool call
- **Plan mode**: Explores and designs a plan before implementing

### Path Validation

- Vault access is symlink-safe via `realpath` checks
- Export paths are write-only (e.g., `~/Desktop`, `~/Downloads`)
- External contexts have full read/write (session-only)

### Blocklist

- Bash command blocklist enabled by default
- Supports regex patterns, platform-specific entries
- Configurable in Settings → Safety

## Development Workflow

### Pre-Commit Checklist

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

### Version Management

- Version is defined in `package.json`
- `manifest.json` is auto-synced via `npm run version`
- `versions.json` tracks minAppVersion for each release

### Build Artifacts

Production build generates:
- `main.js` - Bundled plugin code
- `manifest.json` - Plugin manifest
- `styles.css` - Compiled CSS

These are the only files needed for distribution.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | Claude Code SDK integration |
| `@modelcontextprotocol/sdk` | MCP (Model Context Protocol) support |
| `obsidian` | Obsidian API types |
| `tslib` | TypeScript runtime helpers |

## Troubleshooting

### Common Issues

**Claude CLI not found** (`spawn claude ENOENT`):
- Set path in Settings → Advanced → Claude CLI path
- Find path with `which claude` (macOS/Linux) or `where.exe claude` (Windows)

**npm CLI and Node.js not in same directory**:
- Install native binary (recommended)
- Or add Node.js path to Settings → Environment: `PATH=/path/to/node/bin`

## Useful Resources

- [Obsidian API Documentation](https://docs.obsidian.md/)
- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Code Docs](https://code.claude.com/docs/en/overview)
