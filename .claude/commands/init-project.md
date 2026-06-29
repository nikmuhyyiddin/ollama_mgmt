# Initialize Project

Run the following steps to set up and run this project locally for the first time.

---

## 1. Choose Your Framework & Scaffold

Pick your stack and scaffold the project. Examples below — choose one:

### Option A: Next.js (Full-stack, recommended)
```bash
npx create-next-app@latest ./ --typescript --tailwind --app --src-dir --no-turbopack
```

### Option B: Vite (Frontend only)
```bash
npx create-vite@latest ./ --template react-ts
```

### Option C: Python / FastAPI (Backend)
```bash
uv init
uv add fastapi uvicorn
```

---

## 2. Install Dependencies

### Node.js projects (Windows & Linux compatible)
```bash
npm install --legacy-peer-deps
```

> ⚠️ **Cross-platform note**: Never hardcode platform-specific packages like
> `@rollup/rollup-linux-x64-gnu` in package.json — npm resolves the right
> native binary automatically per OS.

### Python projects
```bash
uv sync
```

---

## 3. Create Environment File
```bash
# Windows
copy .env.example .env.local

# Linux / macOS
cp .env.example .env.local
```
Then fill in your credentials (DB URL, API keys, auth secrets, etc.).

---

## 4. Set Up Database (if applicable)

### Drizzle ORM + Neon Postgres
```bash
npm run db:push
```

### Prisma
```bash
npx prisma migrate dev
```

### Alembic (Python)
```bash
uv run alembic upgrade head
```

---

## 5. Start Development Server

### Node.js
```bash
npm run dev
```

### Python / FastAPI
```bash
uv run uvicorn app.main:app --reload --port 8000
```

---

## 6. Validate Setup

```bash
# Node.js — check linting
npm run lint

# Node.js — run tests
npm run test

# Python
uv run pytest
```

---

## Access Points (defaults — adjust per project)

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| API | http://localhost:8000 |
| DB Studio | `npm run db:studio` |

---

## Notes

- After setup, run `/prime` to load full codebase context into the AI agent.
- After writing `CLAUDE.md`, the agent will apply your project's rules automatically.
