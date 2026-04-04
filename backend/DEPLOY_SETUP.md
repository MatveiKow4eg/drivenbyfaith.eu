# Backend Auto-Deploy Setup (GitHub -> Vultr)

## 1) GitHub Secrets (Repository -> Settings -> Secrets and variables -> Actions)

Add these secrets:

- `VULTR_HOST` - public IP/domain of Vultr server.
- `VULTR_USER` - SSH user on server (example: `deploy`).
- `VULTR_SSH_PRIVATE_KEY` - private SSH key content used by GitHub Actions.
- `VULTR_APP_DIR` - absolute path to project on server (example: `/opt/drivenbyfaith.eu`).

## 2) Backend Environment File on Vultr

Create file: `APP_DIR/backend/.env`

Use at least these vars:

- `NODE_ENV=production`
- `PORT=4000`
- `DATABASE_URL=...`
- `APP_BASE_URL=...`
- `FRONTEND_URL=...`
- `JWT_SECRET=...`
- `UPLOAD_DIR=...`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_PUBLISHABLE_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`

## 3) Vultr Server Prerequisites

- Docker + Docker Compose installed.
- Repository cloned into `VULTR_APP_DIR`.
- SSH public key (matching `VULTR_SSH_PRIVATE_KEY`) added to `~/.ssh/authorized_keys` for `VULTR_USER`.
- Port `4000` allowed in firewall (or use reverse proxy like Nginx/Caddy).

## 4) How Deploy Works

On push to `main` with changes in `backend/**`:

1. GitHub Actions connects over SSH.
2. Runs `backend/scripts/deploy-vultr.sh` on server.
3. Script pulls latest code.
4. Builds backend container.
5. Runs `npx prisma migrate deploy` (applies SQL migrations from files).
6. Restarts backend container.

## 5) Important

- Do not run `prisma migrate dev` on production server.
- Add every migration as files in `backend/prisma/migrations/*` and commit to Git.
- This repo already includes first migration file at `backend/prisma/migrations/20260404_init/migration.sql`.
