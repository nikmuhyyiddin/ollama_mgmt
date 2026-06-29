---
description: Prime agent with codebase understanding
---

# Prime: Load Project Context

## Objective

Build a comprehensive understanding of the codebase by reading structure, documentation, and key files before starting any work.

Run this at the **start of every new session** or when switching features.

---

## Process

### 1. Analyze Project Structure

List all tracked files:
```bash
git ls-files
```

Show directory tree (pick one based on your OS):
```bash
# Linux / macOS
tree -L 3 -I 'node_modules|__pycache__|.git|dist|build|.next'

# Windows (PowerShell)
Get-ChildItem -Recurse -Depth 3 | Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|build|\.next' }
```

### 2. Read Core Documentation

Read in this order:
1. `README.md` — Project overview and development workflow
2. `CLAUDE.md` — AI agent rules and project conventions
3. `.claude/PRD.md` — Product requirements (what we're building)
4. Any relevant plan in `.agents/plans/` for the current feature

### 3. Identify Key Files

Based on the framework, read:
- Entry points (`src/app/page.tsx`, `src/main.ts`, `app/main.py`)
- Config files (`package.json`, `tsconfig.json`, `pyproject.toml`)
- Database schema (`src/lib/db/schema.ts`, `prisma/schema.prisma`, etc.)
- Middleware / Auth (`src/middleware.ts`, etc.)

### 4. Understand Current State

```bash
git log -10 --oneline
git status
git branch
```

---

## Output Report

Provide a concise summary:

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture
- Overall structure (App Router, MVC, etc.)
- Key directories and their purposes

### Tech Stack
- Language & runtime versions
- Frameworks and major libraries
- Build, test, and lint tools

### Current State
- Active branch
- Recent commits
- Any active feature in progress (from `.agents/plans/`)

---

**Make this summary easy to scan — use bullet points and clear headers.**
