# Deploy Budget Splitter to splitx.suntzutechnologies.com

This guide walks you through deploying the Budget Splitter API and landing page on your VPS so it is available at **https://splitx.suntzutechnologies.com**.

---

## Overview

| Component        | Role |
|-----------------|------|
| **Node.js app** | Serves the API (`/api`, `/auth`) and the landing page (static files from `public/`) on port 3012 |
| **PM2**         | Keeps the Node app running and restarts it on failure |
| **PostgreSQL**  | Database for VPS mode (users, groups, expenses) |
| **Nginx**       | Reverse proxy: accepts HTTPS for splitx.suntzutechnologies.com and forwards to port 3012 |
| **Certbot**     | Issues and renews TLS certificates (HTTPS) |

---

## Prerequisites

- A VPS (Ubuntu 22.04 or similar) with root or sudo access
- Domain **splitx.suntzutechnologies.com** pointing to your VPS public IP (A record)
- SSH access to the VPS

---

## 1. Connect and prepare the server

```bash
ssh your-user@your-vps-ip
```

Update the system and install Node.js 20 LTS, PostgreSQL, Nginx, and Certbot:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (process manager)
sudo npm install -g pm2
```

Verify:

```bash
node -v   # v20.x
pm2 -v
psql --version
nginx -v
```

---

## 2. PostgreSQL: create database and user

```bash
sudo -u postgres psql
```

In the `psql` prompt:

```sql
CREATE DATABASE budget_splitter;
CREATE USER budget_user WITH PASSWORD '5792_Ang';
ALTER DATABASE budget_splitter OWNER TO budget_user;
\c budget_splitter
GRANT ALL ON SCHEMA public TO budget_user;
\q
```

Then load the schema (run from your **local** machine or copy the file to the VPS first):

```bash
# If you have the repo on the VPS (see step 3), from the project root:
sudo -u postgres psql -d budget_splitter -f database/schema.sql
```

If the schema uses `CREATE TABLE` and the DB user owns the schema, you may run as `budget_user`:

```bash
PGPASSWORD=your_secure_password_here psql -h localhost -U budget_user -d budget_splitter -f database/schema.sql
```

Use the same password you set above. Adjust if your schema expects postgres.

---

## 3. Deploy the application

### Option A: Clone from Git (recommended)

```bash
mkdir -p /root/projects
cd /root/projects
git clone https://github.com/your-username/budget_splitter_web.git
cd budget_splitter_web
```

If the repo is private, use SSH or a deploy key.

### Option B: Upload with SCP/SFTP

From your **local** machine (in the project directory):

```bash
scp -r . your-user@your-vps-ip:/root/projects/budget_splitter_web
```

Then on the VPS:

```bash
cd /root/projects/budget_splitter_web
```

### Install dependencies and set environment

```bash
cd /root/projects/budget_splitter_web
npm install --production
cp .env.example .env
nano .env
```

Set these in `.env`:

```env
MODE=vps
PORT=3012

DB_HOST=localhost
DB_PORT=5432
DB_NAME=budget_splitter
DB_USER=budget_user
DB_PASSWORD=your_secure_password_here
DB_SSL=false

JWT_SECRET=your-very-long-random-secret-key-at-least-32-characters
```

Generate a strong `JWT_SECRET` (e.g. `openssl rand -base64 32`). Save and exit.

---

## 4. Run the app with PM2

```bash
cd /root/projects/budget_splitter_web
pm2 start ecosystem.config.js --env vps
pm2 save
pm2 startup
```

Follow the command `pm2 startup` prints so PM2 runs on reboot. Check:

```bash
pm2 status
pm2 logs budget-splitter-api --lines 30
curl -s http://localhost:3012/health
```

You should see `{"status":"ok","mode":"vps",...}` and the landing page at `http://localhost:3012/`.

---

## 5. Nginx: reverse proxy for splitx.suntzutechnologies.com

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/splitx
```

Paste (replace `splitx.suntzutechnologies.com` if you use a different hostname):

```nginx
server {
    listen 80;
    server_name splitx.suntzutechnologies.com;
    location / {
        proxy_pass http://127.0.0.1:3012;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and test:

```bash
sudo ln -s /etc/nginx/sites-available/splitx /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Visit **http://splitx.suntzutechnologies.com** — you should see the Budget Splitter landing page.

---

## 6. HTTPS with Let’s Encrypt

```bash
sudo certbot --nginx -d splitx.suntzutechnologies.com
```

Follow the prompts (email, agree to terms). Certbot will adjust the Nginx config and set up renewal. Test renewal:

```bash
sudo certbot renew --dry-run
```

Then open **https://splitx.suntzutechnologies.com** — the site and API should be served over HTTPS.

---

## 7. Post-deploy checks

| Check | Command / URL |
|-------|----------------|
| Landing page | https://splitx.suntzutechnologies.com |
| Health | https://splitx.suntzutechnologies.com/health |
| API (VPS mode) | Use your app’s auth/register and then API calls as in your iOS/client docs |

CORS is already set to allow `https://splitx.suntzutechnologies.com` in `server.js`, so browser clients on that domain can call the API.

---

## Updating the app later

```bash
cd /root/projects/budget_splitter_web
git pull
npm install --production
pm2 restart budget-splitter-api
```

If you change `.env`, restart again after editing:

```bash
pm2 restart budget-splitter-api
```

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| 502 Bad Gateway | App not running or wrong port. Run `pm2 status` and `curl http://localhost:3012/health`. |
| Database connection errors | Check DB_* in `.env`, PostgreSQL is running: `sudo systemctl status postgresql`. |
| Permission denied on files | Ensure the user running PM2 owns `/root/projects/budget_splitter_web` (e.g. `chown -R root:root /root/projects/budget_splitter_web`). |
| Nginx 404 | Confirm `proxy_pass http://127.0.0.1:3012;` and that the app listens on 3012. |
| HTTPS mixed content | Use HTTPS everywhere; the guide uses Certbot so the site is served over HTTPS. |

---

## Summary

1. Point **splitx.suntzutechnologies.com** to your VPS IP.
2. Install Node 20, PM2, PostgreSQL, Nginx, Certbot.
3. Create PostgreSQL database and user, load `database/schema.sql`.
4. Clone or upload the app to `/root/projects/budget_splitter_web`, set `.env` with `MODE=vps` and DB/JWT values.
5. Start with `pm2 start ecosystem.config.js --env vps` and enable `pm2 startup`.
6. Configure Nginx for `splitx.suntzutechnologies.com` → `http://127.0.0.1:3012`.
7. Run `certbot --nginx -d splitx.suntzutechnologies.com` for HTTPS.

After that, **https://splitx.suntzutechnologies.com** serves the landing page and the Budget Splitter API for your iOS app or other clients.
