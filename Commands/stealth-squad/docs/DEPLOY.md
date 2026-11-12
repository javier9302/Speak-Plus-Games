# Running Stealth Squad online

## In class on your laptop (no internet needed)
`npm run dev` → open `http://localhost:5173/host` on the laptop; students scan the QR code.

## Production build without Docker
```bash
npm install
npm run build        # web page (client/dist) + server bundle (server/dist/index.mjs)
npm start            # one port (PORT, default 2567) serves the game AND the web page
```
Open `http://<this-computer>:2567/host`. Live numbers: `http://<this-computer>:2567/metrics`.

**The host screen is for the teacher's laptop, not the projector.** It shows every robot's vision
cone, which only the Scout is meant to see; projected, nobody would need to ask the Scout.

**Admin pages.** `/colyseus` (the room monitor, which can close live rooms) and `/metrics` open
without a password only on the computer running the server. From any other device, and always on a
cloud host, they need the `ADMIN_PASSWORD` environment variable (the browser asks; any user name). If
it isn't set they answer "Not found".

## Docker
```bash
docker build -t stealth-squad .
docker run -p 2567:2567 stealth-squad
```
The image serves everything on one port (`PORT`, default 2567). Use HTTPS in the
cloud — the page then connects with `wss://` to the same address automatically.

### Hosting options
All need **one** always-on instance with WebSockets (game rooms live in memory,
so don't scale to several instances).

| Host | Notes |
|---|---|
| **Fly.io** (recommended) | `fly launch` (uses the Dockerfile), set internal port 2567, keep 1 machine, turn **auto-stop off** so rooms aren't killed mid-lesson. Smallest machine (shared CPU, 256–512 MB) is enough. |
| Render | The `stealth-squad` service in `render.yaml` (free plan, no Docker needed). The free plan sleeps after 15 minutes with no visitors and forgets its rooms: open `/host` a minute before class and keep it open, and the game stays awake while students play. For daily classes a paid instance never sleeps. |
| Plain VM (any provider) | Install Docker, run the image, put Caddy or nginx in front for HTTPS. |

## Resource report (bot load test)
`npm run loadtest -- --rooms N --seconds S [--url …] [--level …]` — 6 bots per
room wander, crawl and ping while the server's `/metrics.json` is sampled.
Measured on the production build (Apple M2 laptop, Node 24), Nov 2026:

| Scenario | Clients | CPU (1 core) avg / max | Tick avg / max | Memory (RSS) | Sent per client |
|---|---|---|---|---|---|
| 1 room, Snow Outpost (dev server) | 7 + host tab | 1.8% / 2.4% | 0.05 / 3.4 ms | 100 MB | 0.8 kB/s (6.4 kbit/s) |
| 3 rooms, Night Depot | 21 | 4.4% / 6.3% | 0.23 / 3.0 ms | 97 MB | 1.0 kB/s (8.2 kbit/s) |
| 6 rooms, Snow Outpost | 42 | 5.1% / 6.1% | 0.10 / 1.7 ms | 99 MB | 0.9 kB/s (7.4 kbit/s) |

Tick budget is 50 ms (20 Hz); the heaviest case uses about 1.4% of it.

**Small cloud VM (1 vCPU, 1 GB RAM):** a shared cloud vCPU is roughly 2–4× slower
than one M2 core, so 3 rooms would use about 10–20% CPU and ~100 MB RAM —
plenty of room. Bandwidth for a full class (7 clients) is about 7 kB/s.

## Render (how it's online now)
The `stealth-squad` service is in `render.yaml` at the root of the hub repository,
next to Lantern Island (region Singapore, `rootDir: Commands/stealth-squad`).
Render runs `npm ci && npm run build`, then `npm start`, and checks `/health`.
1. Push to GitHub. In Render: **Blueprints** → the hub blueprint → **Sync**
   (or **New → Blueprint** the first time) and approve the new `stealth-squad` service.
2. Open `https://<service>.onrender.com/host`; the QR code uses that address.
No environment variables are needed. The free plan sleeps after 15 minutes
without use and drops rooms when it does: open `/host` a minute before class,
or switch the plan to `starter` so it stays awake during lessons.
