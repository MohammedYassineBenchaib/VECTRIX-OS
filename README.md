# VECTRIX OS

Engineering-to-installation workspace. Engineering intelligence, built for the field.

VECTRIX OS is an npm-workspaces monorepo with the web application in `apps/web` and shared packages in `packages/*`.

## Requirements

- Node.js 20.9+
- npm

## Quick start

```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev
```

Configure local settings in `apps/web/.env`, using `.env.example` as a reference.

## Useful scripts

- Development: `npm run dev`, `npm run build`, `npm run start`
- Quality: `npm run lint`, `npm run typecheck`, `npm run format:check`
- Tests: `npm test`, `npm run test:unit`, `npm run test:e2e`
- Database: `npm run db:push`, `npm run db:migrate`, `npm run db:seed`, `npm run db:reset`
