# MuzaLife Backend — Production Deployment Guide

This document describes how to deploy the MuzaLife Backend to a production Linux server. It is intended for **release engineers and DevOps engineers**.

---

## Table of Contents

1. [Hardware Requirements](#1-hardware-requirements)
2. [Software Requirements](#2-software-requirements)
3. [Network Configuration](#3-network-configuration)
4. [Server Configuration](#4-server-configuration)
5. [Database Setup](#5-database-setup)
6. [Code Deployment](#6-code-deployment)
7. [Process Management](#7-process-management)
8. [Health Verification](#8-health-verification)

---

## 1. Hardware Requirements

| Component | Minimum | Recommended |
|---|---|---|
| Architecture | x86_64 (amd64) | x86_64 |
| CPU | 1 vCPU / 1 GHz | 2 vCPU / 2+ GHz |
| RAM | 512 MB | 2 GB |
| Disk | 10 GB | 20 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

---

## 2. Software Requirements

Install the following on the production server:

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 15
sudo apt install -y postgresql postgresql-contrib

# Install PM2 (Node.js process manager)
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Verify installations
node -v    # should print v20.x.x
npm -v
psql --version
pm2 -v
```

---

## 3. Network Configuration

### Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 5001/tcp   # Backend API (or use a reverse proxy on 443)
sudo ufw enable
sudo ufw status
```

### Reverse Proxy with Nginx (recommended for production)

Install Nginx as a reverse proxy to forward HTTPS traffic on port 443 to the Node.js app on port 5001:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx site config
sudo nano /etc/nginx/sites-available/muzalife-backend
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name api.muzalife.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.muzalife.com;

    ssl_certificate     /etc/letsencrypt/live/api.muzalife.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.muzalife.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/muzalife-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d api.muzalife.com
```

> For the Node.js server itself, replace the self-signed certs in `certs/` with your domain certificates or let Nginx handle SSL termination (set `BACKEND_URL` to `http://localhost:5001` in that case).

---

## 4. Server Configuration

### Create a Dedicated User

```bash
sudo useradd -m -s /bin/bash muzalife
sudo su - muzalife
```

### HTTPS Certificates for the Node.js Server

If running the Node.js app directly on HTTPS (without Nginx termination):

```bash
mkdir -p ~/muzalife_backend/certs
# Copy your production certificates to:
# ~/muzalife_backend/certs/localhost-cert.pem
# ~/muzalife_backend/certs/localhost-key.pem
```

---

## 5. Database Setup

### Start PostgreSQL

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Create Database and User

```bash
sudo -u postgres psql <<EOF
CREATE USER muzalife_user WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE muzalife OWNER muzalife_user;
GRANT ALL PRIVILEGES ON DATABASE muzalife TO muzalife_user;
\q
EOF
```

### Run Schema Setup

After code deployment (step 6), run the schema script:

```bash
cd ~/muzalife_backend
npm run setup-db
```

---

## 6. Code Deployment

```bash
# Clone the repository (first deploy)
cd ~
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend

# Install production dependencies only
npm ci --omit=dev

# Create and fill .env (see README for all variables)
cp .env.example .env   # if an example file exists
nano .env

# Set NODE_ENV
echo "NODE_ENV=production" >> .env

# Create uploads directory
mkdir -p uploads/products uploads/profiles
```

---

## 7. Process Management with PM2

PM2 ensures the app restarts automatically on crash and on server reboot.

```bash
# Start the application
pm2 start server.js --name "muzalife-backend" --interpreter node

# Save the process list so it restarts on reboot
pm2 save

# Configure PM2 to launch on system startup
pm2 startup
# Follow the printed command (sudo env PATH=... pm2 startup ...)
```

### Useful PM2 Commands

```bash
pm2 status                        # Show all processes
pm2 logs muzalife-backend         # Tail live logs
pm2 restart muzalife-backend      # Restart the app
pm2 reload muzalife-backend       # Zero-downtime reload
pm2 stop muzalife-backend         # Stop the app
pm2 delete muzalife-backend       # Remove from PM2 list
```

---

## 8. Health Verification

After deployment, verify each endpoint:

```bash
# Health check
curl -k https://localhost:5001/api/health
# Expected: {"status":"OK","message":"Muza Life Backend Server is running!",...}

# Database connectivity
curl -k https://localhost:5001/api/test-db
# Expected: {"status":"Database connected successfully","currentTime":"..."}

# API info
curl -k https://localhost:5001/api/info
# Expected: JSON with endpoints map
```

Check PM2 logs for any errors:

```bash
pm2 logs muzalife-backend --lines 50
```

Check PostgreSQL connection:

```bash
psql -U muzalife_user -d muzalife -c "SELECT COUNT(*) FROM users;"
```

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---|---|---|
| `Missing HTTPS certificates!` | `certs/` folder is empty | Generate or copy SSL certs |
| `ECONNREFUSED` on DB connect | PostgreSQL not running | `sudo systemctl start postgresql` |
| Port 5001 already in use | Another process on the port | `sudo lsof -i:5001` and kill it |
| `permission denied` on uploads | Wrong directory ownership | `chown -R muzalife:muzalife uploads/` |
