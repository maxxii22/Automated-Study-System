# Automated Study Systems

Local AI-powered study guide and flashcard generator built with React, Node.js, Gemini, and local file persistence, with Prisma + SQLite prepared for the next step.

## Planned Stack

- React + Vite + TypeScript
- Node.js + Express + TypeScript
- Prisma + SQLite
- Gemini API for study material generation

## Workspace Layout

- `client` - frontend application
- `server` - backend API and Prisma schema
- `shared` - shared TypeScript contracts

## Next Steps

1. Add `GEMINI_API_KEY=your_key` to `server/.env`.
2. Optionally set `GEMINI_MODEL=gemini-2.5-flash`.
3. Start the API with `npm run dev:server`.
4. Start the frontend with `npm run dev:client`.
5. Open `http://localhost:5173`.

## Current State

- The frontend supports landing, create, generate, save, and study-set detail views, including PDF upload on the create screen.
- The backend exposes `GET /api/health`, `GET /api/study-sets`, `GET /api/study-sets/:id`, `POST /api/study-sets/generate`, and `POST /api/study-sets`.
- Study generation now uses the Gemini API from the backend.
- PDF uploads are sent to Gemini as inline file data.
- Generated study sets are currently stored in `server/src/data/studySets.json` so the app works immediately in this environment.
- Prisma schema and client generation are set up, but local SQLite initialization hit a Prisma schema-engine error on this machine, so the runtime persistence path currently uses JSON storage.
