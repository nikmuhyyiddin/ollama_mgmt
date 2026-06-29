# 🚀 AI-Assisted Project Starter Template

A clean, structured starter template for building full-stack applications using an **AI-first development workflow**. This template works on **Windows and Linux** and supports any tech stack.

The template provides two AI context systems:
- **`.claude/`** — AI rules, slash commands, and the Product Requirements Document (PRD)
- **`.agents/`** — Feature implementation plans created during development

---

## 📋 Table of Contents

1. [Philosophy](#-philosophy)
2. [Folder Structure](#-folder-structure)
3. [📂 File Reference Guide — What Every File Does](#-file-reference-guide--what-every-file-does)
4. [Development Lifecycle](#-development-lifecycle)
5. [Step-by-Step: Starting a New Project](#-step-by-step-starting-a-new-project)
6. [AI Slash Commands Reference](#-ai-slash-commands-reference)
7. [Writing Good PRDs and Plans](#-writing-good-prds-and-plans)
8. [Cross-Platform Notes](#-cross-platform-notes)
9. [Recommended Tech Stacks](#-recommended-tech-stacks)

---

## 💡 Philosophy

> **Plan first. Code second. Validate always.**

This template is built around a structured, repeatable cycle:

```
Idea → PRD → Feature Plan → Implement → Validate → Commit → Repeat
```

The AI agent (Claude, Gemini, etc.) is treated as a **junior developer** who needs complete context to do good work. The `.claude/` and `.agents/` folders provide that context in a structured, persistent way.

**Key principles:**
- 🧠 **Context is King** — The AI works better with complete, organized context
- 📄 **Document before you code** — A good plan prevents bad code
- ✅ **Validate every step** — Every task should have a validation command
- 🔁 **Incremental delivery** — Break features into small, testable phases

---

## 📁 Folder Structure

```
project-root/
│
├── .agents/
│   └── plans/              # Feature implementation plans (one file per feature)
│       └── README.md       # (this is empty — plans are created by the AI)
│
├── .claude/
│   ├── commands/           # Slash commands for your AI assistant
│   │   ├── init-project.md    # How to scaffold and set up the project
│   │   ├── prime.md           # Load full context at start of session
│   │   ├── create-prd.md      # Generate a Product Requirements Document
│   │   ├── create-rules.md    # Generate CLAUDE.md rules from codebase
│   │   ├── plan-feature.md    # Create an implementation plan for a feature
│   │   ├── execute.md         # Execute a feature plan step-by-step
│   │   └── commit.md          # Create a structured git commit
│   ├── skills/             # Reusable AI agent capabilities (e.g., browser testing)
│   ├── CLAUDE-template.md  # Template for writing your project's CLAUDE.md
│   └── PRD.md              # Your project's Product Requirements Document
│
├── CLAUDE.md               # ← YOU CREATE THIS (AI rules for your project)
├── README.md               # This file
└── [your app code here]    # src/, app/, public/, etc. — scaffolded per project
```

---

## 📂 File Reference Guide — What Every File Does

> **Beginner note:** You don't need to memorize all of this. Just read what's relevant when you need it. Each file has a clear job — treat this section as a dictionary you can look up anytime.

---

### 🗂️ `.agents/` folder

**What is it?**
A folder where the AI stores its **feature implementation plans**. Think of it as the AI's notebook for "how to build the next piece of the app."

**Who creates files here?**
The AI creates them automatically when you run `/plan-feature`. You don't write these manually.

**When do you use it?**
- Review the plan file before asking the AI to start coding
- Check old plan files to understand why a feature was built a certain way

---

#### 📄 `.agents/plans/` (folder — empty at start)

This folder holds one plan file per feature. Each file is auto-named by the AI (e.g., `add-user-auth.md`).

**What's inside a plan file?**
- The user story ("As a user I want to…")
- Which files will be created or changed
- Step-by-step implementation tasks
- Validation commands to run after each task
- Links to relevant documentation

> ✅ Always read the plan before telling the AI to execute it. Plans are yours to review and approve.

---

### 🗂️ `.claude/` folder

**What is it?**
A folder that teaches the AI assistant how to work on your project. It contains rules, commands, and your product specification.

**Who reads this?**
Your AI assistant (Claude, Antigravity, Cursor, etc.) reads this automatically. You write it once — the AI refers back to it on every session.

---

#### 📄 `.claude/PRD.md` — Product Requirements Document

**What is it?**
The blueprint of your application. It describes what you're building, who it's for, what features are included, and what success looks like.

**Think of it like:** The brief you'd give an architect before building a house.

**Who creates it?** You describe your idea in chat, then run `/create-prd` — the AI writes it for you.

**When do you edit it?** Whenever your product changes direction, or when adding a major feature phase. Keep it accurate.

**Example contents:**
- "This app lets users manage their team's tasks"
- Users: project managers, team leads
- MVP features: task creation, assignment, status tracking
- Out of scope: billing, mobile app

---

#### 📄 `.claude/CLAUDE-template.md` — Rules Template

**What is it?**
A blank template for writing your project's `CLAUDE.md` file. It has sections like "Tech Stack", "Commands", "File Structure", "Code Patterns."

**Think of it like:** A form you fill out to give the AI a briefing about your project's conventions.

**When do you use it?** When running `/create-rules` — the AI uses this template and fills it in by analyzing your code.

**Do you edit it?** Rarely. It's the master template. Your actual rules file is `CLAUDE.md` at the root.

---

#### 📁 `.claude/commands/` — Slash Commands

**What are these?**
These are instruction files for your AI assistant. Each file defines what the AI should do when you type a specific command (like `/plan-feature` or `/commit`).

**Think of them like:** Recipe cards. When you say "make pasta," the AI reads the pasta recipe card and follows it.

**Do you edit these?** You can, but you don't have to. They work out of the box. Edit them if you want to change how a workflow behaves.

---

##### 📄 `init-project.md` — Project Initialization

**What it does:** Tells the AI how to scaffold and set up a new project — install dependencies, create environment file, run the dev server.

**When to use:** `/init-project` — only at the start of a new project.

**Example:** You run this once when creating a new app. It walks you through picking a framework and getting everything running.

---

##### 📄 `prime.md` — Load Context

**What it does:** Tells the AI to read all your project documentation (README, CLAUDE.md, PRD.md) so it fully understands the codebase before helping you.

**When to use:** `/prime` — **at the start of every work session**, before asking for any code changes.

**Why it matters:** Without priming, the AI might not remember your conventions, patterns, or what you've already built.

> 💡 Think of it as: "AI, wake up and read your briefing before we start work."

---

##### 📄 `create-prd.md` — Generate Product Requirements

**What it does:** Writes a full `PRD.md` document based on your conversation with the AI.

**When to use:** `/create-prd` — at the start of a project after describing what you want to build.

**Output:** `.claude/PRD.md`

---

##### 📄 `create-rules.md` — Generate Project Rules

**What it does:** Analyzes your codebase and generates a `CLAUDE.md` file at the project root. This file tells the AI: "In this project, we always do things this way."

**When to use:** `/create-rules` — after scaffolding your app, before starting feature development.

**Output:** `CLAUDE.md` at root (you should review and edit this)

**Example rules it generates:**
- "We use TypeScript strict mode"
- "API routes live in `src/app/api/`"
- "Run `npm run lint` before every commit"

---

##### 📄 `plan-feature.md` — Create a Feature Plan

**What it does:** Takes a feature description and produces a detailed implementation plan — including which files to create, what patterns to follow, and how to validate the work.

**When to use:** `/plan-feature [your feature description]` — before coding any new feature.

**Output:** `.agents/plans/[feature-name].md`

**Why this matters:** Planning before coding prevents mistakes, keeps code consistent, and gives the AI all the context it needs to succeed on the first attempt.

---

##### 📄 `execute.md` — Implement a Plan

**What it does:** Reads a plan file from `.agents/plans/` and implements it step by step, running validation commands after each task.

**When to use:** `/execute .agents/plans/your-feature-name.md` — after reviewing and approving a plan.

**The AI will:**
1. Read the whole plan
2. Implement each task in order
3. Run validation commands
4. Report what was completed

---

##### 📄 `commit.md` — Create a Git Commit

**What it does:** Checks what files changed since the last commit, groups related changes, and creates a clean commit message following standard conventions.

**When to use:** `/commit` — after completing a feature and all validations pass.

**Commit format it follows:**
```
feat: add user authentication with Google OAuth
fix: resolve session timeout on mobile
docs: update README with setup instructions
```

---

#### 📁 `.claude/skills/` — Reusable Agent Capabilities

**What is it?**
Pre-built skills the AI can use for advanced testing scenarios — specifically browser automation and end-to-end testing.

**Do beginners need this?** Not right away. You'll use these when you want the AI to test your app by actually clicking through it like a real user.

| Skill | What it does |
|-------|-------------|
| `agent-browser/` | Lets the AI open a browser, navigate pages, and interact with UI |
| `e2e-test/` | Enables writing and running end-to-end browser tests |

---

### 📄 `CLAUDE.md` (root — you create this)

**What is it?**
The most important file in your project. It's the AI's standing instructions for your specific codebase.

**When is it created?** You generate it with `/create-rules` after scaffolding.

**What it contains:**
- What the project is
- The tech stack and versions
- How to run, build, and test the app
- File/folder structure
- Naming conventions ("We use camelCase for functions")
- Code patterns to follow

**Do you edit it?** Yes — review what the AI generated and add anything it missed. Keep it updated as the project grows.

> 🔑 This is the single most important file for AI-quality output. A well-written `CLAUDE.md` dramatically improves what the AI produces.

---

## 🔄 Development Lifecycle

This is the workflow you follow for **every project and every feature**:

```
┌─────────────────────────────────────────────────────┐
│                  PROJECT START                       │
│                                                      │
│  1. Scaffold app (/init-project)                     │
│  2. Write PRD (/create-prd)                          │
│  3. Generate CLAUDE.md rules (/create-rules)         │
│  4. Prime the agent (/prime)                         │
│                                                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               FEATURE DEVELOPMENT LOOP               │
│                                                      │
│  5. Plan the feature (/plan-feature [feature name])  │
│     → Creates: .agents/plans/[feature-name].md       │
│                                                      │
│  6. Review and approve the plan                      │
│                                                      │
│  7. Execute the plan (/execute [path-to-plan])       │
│                                                      │
│  8. Validate (run lint, tests, manual checks)        │
│                                                      │
│  9. Commit (/commit)                                 │
│                                                      │
│  10. Repeat (go to step 5 for next feature)          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🛠 Step-by-Step: Starting a New Project

### Step 1 — Copy this template

```bash
# Clone this repo into your new project folder
git clone <this-template-repo-url> my-new-app
cd my-new-app

# Remove the template's git history
# Windows
Remove-Item -Recurse -Force .git

# Linux / macOS
rm -rf .git

# Start fresh
git init
```

### Step 2 — Scaffold your app

Use `/init-project` to get the right `npm` or framework scaffold command for your stack.

Example for Next.js:
```bash
npx create-next-app@latest ./ --typescript --tailwind --app --src-dir --no-turbopack
```

See [`.claude/commands/init-project.md`](.claude/commands/init-project.md) for all options.

### Step 3 — Describe your project to the AI

Tell your AI assistant what you're building. Be specific:
- What is the problem you're solving?
- Who are the users?
- What are the key features for the first version?

Then run:
```
/create-prd
```
The AI will generate `.claude/PRD.md` — your project's source of truth.

### Step 4 — Generate your project rules

```
/create-rules
```
This generates a `CLAUDE.md` at the root. It tells the AI:
- What this project is
- What tech stack is used
- Naming conventions and patterns
- How to validate code

> **Review and edit `CLAUDE.md`** — add anything the AI missed.

### Step 5 — Prime the agent at every session start

```
/prime
```
This loads the full project context into the AI at the start of every work session. Run it before asking for any code changes.

### Step 6 — Plan before you build

For each new feature:
```
/plan-feature [describe what you want]
```

Example:
```
/plan-feature Add user authentication with email/password and Google OAuth
```

The AI will:
1. Analyze your codebase
2. Research best practices
3. Create a detailed plan at `.agents/plans/[feature-name].md`

**Always review the plan before executing.** The plan should be complete enough that any developer (or AI) can implement it without additional questions.

### Step 7 — Execute the plan

```
/execute .agents/plans/add-user-authentication.md
```

The AI will implement the plan task by task, running validation commands at each step.

### Step 8 — Commit your work

```
/commit
```

Creates a well-formatted git commit following conventional commits style.

---

## 📖 AI Slash Commands Reference

| Command | Purpose | When to use |
|---------|---------|-------------|
| `/init-project` | Scaffold and set up the project | Project start only |
| `/prime` | Load full codebase context | Start of every session |
| `/create-prd` | Generate Product Requirements Doc | Project start / major pivots |
| `/create-rules` | Generate `CLAUDE.md` project rules | After scaffolding |
| `/plan-feature [name]` | Create a feature implementation plan | Before every feature |
| `/execute [plan-path]` | Implement a feature from its plan | After reviewing plan |
| `/commit` | Create a structured git commit | After each feature |

---

## ✍️ Writing Good PRDs and Plans

### A good PRD answers:
- ❓ What problem are we solving?
- 👤 Who is the user?
- ✅ What is in scope for this version?
- ❌ What is explicitly out of scope?
- 📐 What does success look like?

### A good feature plan contains:
- 📌 A clear user story ("As a user, I want to… so that…")
- 📁 Which files need to be created or modified
- 🔗 Links to relevant documentation
- 🧩 Code patterns extracted from the existing codebase
- ✅ Validation commands for every task
- ☑️ Acceptance criteria

> **The plan is for the AI.** The more context the plan contains, the better the implementation will be on the first attempt.

---

## 🌐 Cross-Platform Notes

This template is designed to work on **both Windows and Linux** without changes.

### npm / Node.js

- ✅ Always delete `package-lock.json` before running `npm install` on a new OS
- ❌ Never hardcode OS-specific native packages in `package.json` (e.g., `@rollup/rollup-linux-x64-gnu`) — npm resolves these automatically
- ✅ Use `npm install --legacy-peer-deps` for Next.js 15 / React 19 projects

### Shell commands in plans

When writing shell commands in plans or docs, provide both variants:

```bash
# Linux / macOS
cp .env.example .env.local

# Windows (PowerShell)
copy .env.example .env.local
```

### File paths

When writing paths in plans:
- Use forward slashes (`/`) — they work on both platforms in most tools
- Avoid absolute paths — always use relative paths from the project root

---

## 🧰 Recommended Tech Stacks

Use this template with any of the following:

### Full-Stack Web App
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Neon Postgres + Drizzle ORM |
| Auth | Neon Auth / Clerk / Auth.js |
| Testing | Vitest + Testing Library |
| Linting | Biome |

### Frontend SPA
| Layer | Technology |
|-------|-----------|
| Framework | Vite + React |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand / TanStack Query |
| Testing | Vitest |

### Backend API (Python)
| Layer | Technology |
|-------|-----------|
| Framework | FastAPI |
| Language | Python 3.12+ |
| Package manager | uv |
| Database | PostgreSQL + SQLAlchemy / Alembic |
| Testing | pytest |

---

## 🤖 How to Use This With Different AI Tools

| Tool | How slash commands work |
|------|------------------------|
| **Claude Code** | `/command-name` triggers `.claude/commands/*.md` automatically |
| **Cursor / Windsurf** | Reference the command files manually in chat |
| **Antigravity (this tool)** | Ask the AI to read and follow a specific command file |
| **Any AI** | Copy-paste the content of the command file as a prompt |

---

## 📝 Quick Start Checklist

When starting a new project with this template:

- [ ] Copy template, remove old `.git`, run `git init`
- [ ] Scaffold app framework (`/init-project`)
- [ ] Create `PRD.md` (`/create-prd`)
- [ ] Create `CLAUDE.md` rules (`/create-rules`)
- [ ] First commit: `git add . && git commit -m "chore: init project from template"`
- [ ] Plan first feature (`/plan-feature`)
- [ ] Execute plan (`/execute .agents/plans/[feature].md`)
- [ ] Validate and commit (`/commit`)
- [ ] Repeat cycle for each feature ♻️

---

*This template is based on the AI-assisted development workflow from [coleam00/link-in-bio-page-builder](https://github.com/coleam00/link-in-bio-page-builder), adapted into a universal starter.*
