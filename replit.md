# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.
Also contains a standalone Flask (Python) recipe book web app.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Flask Recipe Book App

- **Location**: `artifacts/recipe-book/`
- **Entry point**: `artifacts/recipe-book/app.py`
- **Language**: Python 3.11
- **Dependencies**: flask, markdown
- **Port**: 3000 (reads `PORT` env var)
- **Data storage**: `recipe_book.md` (uploaded recipe file), `bookmarks.json` (flat JSON)

### Features
- Upload `.md` recipe file via browser
- 4-tab UI: Index (categorized), Search by ingredient, Recipe Viewer, Bookmarks
- Parses `## Recipe N — Title` blocks with tag lines and ingredient sections
- Bookmarks persisted to `bookmarks.json`
- Dark warm theme, mobile-first

### API Endpoints
- `GET /api/recipes` — all recipe titles + numbers + tags
- `GET /api/recipe/<number>` — full recipe as rendered HTML
- `GET /api/search?ingredient=<query>` — ingredient search
- `POST /api/bookmark` — toggle bookmark
- `GET /api/bookmarks` — all bookmarks
- `POST /api/upload` — upload/replace .md file
- `GET /api/file-status` — check if file is uploaded
- `POST /api/remove-file` — remove uploaded file

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `python artifacts/recipe-book/app.py` — run Flask recipe book

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
