# Budget Splitter API Server

Node.js API for Budget Splitter. Runs in two modes: **local** (SQLite, no auth) and **vps** (PostgreSQL, JWT auth).

- **Port**: 3012
- **Database (VPS)**: `budget_splitter` (PostgreSQL)
- **Process manager**: PM2

## Quick Start

```bash
cd budget_splitter_web
npm install
cp .env.example .env
# Edit .env: set MODE=local or MODE=vps, and DB credentials for vps
npm start
```

## Modes

### Local Mode (`MODE=local`)
- **Storage**: SQLite (`./data/budget_splitter.db`)
- **Auth**: None
- **Use case**: Development, standalone, or iOS app connecting to local server

**Endpoints:**
- `GET /api/members` - List members
- `POST /api/members` - Add member
- `DELETE /api/members/:id` - Remove member
- `POST /api/members/reset` - Reset to defaults
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Add expense
- `DELETE /api/expenses/:id` - Delete expense
- `GET /api/summary` - Summary stats

### VPS Mode (`MODE=vps`)
- **Storage**: PostgreSQL (`budget_splitter`)
- **Auth**: JWT (register/login)
- **Use case**: Production, multi-user, cloud sync

**Endpoints:** See SWIFT_DEVELOPER_GUIDE.md in ../budget_splitter_ios

## PM2

```bash
# Start (uses MODE from .env)
pm2 start ecosystem.config.js

# Start in local mode
pm2 start ecosystem.config.js --env local

# Start in VPS mode
pm2 start ecosystem.config.js --env vps

# Logs
pm2 logs budget-splitter-api

# Restart
pm2 restart budget-splitter-api
```

## Database Setup (VPS)

```bash
# Create database and user
sudo -u postgres psql -c "CREATE DATABASE budget_splitter;"
sudo -u postgres psql -c "CREATE USER budget_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE budget_splitter TO budget_user;"

# Run schema
psql -d budget_splitter -U budget_user -f database/schema.sql
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| MODE | local | `local` or `vps` |
| PORT | 3012 | Server port |
| SQLITE_PATH | ./data/budget_splitter.db | SQLite file (local) |
| DB_HOST | localhost | PostgreSQL host (vps) |
| DB_PORT | 5432 | PostgreSQL port |
| DB_NAME | budget_splitter | Database name |
| DB_USER | budget_user | Database user |
| DB_PASSWORD | (required) | Database password |
| JWT_SECRET | (change!) | JWT signing secret (vps) |
