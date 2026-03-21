# Portfolio Tracker — Local Setup with Docker

## Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

---

## Quickstart (3 commands)

```bash
# 1. Make sure your source files are in place (see structure below)
# 2. Build and start
docker compose up --build

# 3. Open in browser
open http://localhost:3000
```

That's it. The app runs at **http://localhost:3000**.

---

## Project structure required before building

```
your-project/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── package.json
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── App.js          ← replaced with generic version
│   ├── styles.css      ← replaced with generic version
│   └── index.js
└── server/
    └── server.js       ← replaced with generic version
```

---

## Useful commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Build image and start container |
| `docker compose up -d` | Start in background (detached) |
| `docker compose down` | Stop and remove container |
| `docker compose logs -f` | Follow live logs |
| `docker compose restart` | Restart without rebuilding |

---

## Data persistence

Snapshots are stored in a Docker **named volume** (`portfolio-data`).  
They survive container restarts and `docker compose down`.

To wipe all snapshot data:
```bash
docker compose down -v   # removes the volume too
```

---

## Ports

| Host | Container | Service |
|---|---|---|
| 3000 | 10000 | Portfolio Tracker (web + API) |

If port 3000 is taken, change it in `docker-compose.yml`:
```yaml
ports:
  - "8080:10000"   # use 8080 instead
```

---

## Rebuild after code changes

```bash
docker compose up --build
```
