# Deploying JAZO to Vultr

Two containers on a single Vultr Compute instance: the Next.js server, and Caddy
in front of it terminating TLS.

**TLS is mandatory, not a nicety.** Push-to-talk calls `getUserMedia`, which
browsers only allow in a secure context. Served over `http://<ip>:3000` the app
loads and the typed chat works, but the microphone is permanently dead with no
useful error. That is why Caddy and a real domain are in the critical path.

---

## 1. What you need first

| | |
|---|---|
| Instance | Vultr Compute, **2 vCPU / 2 GB minimum**, Ubuntu 24.04 |
| Domain | An A record pointing at the instance's public IP, **resolving before you deploy** |
| Firewall | Inbound `22`, `80`, `443` open |
| Keys | Gemini + ElevenLabs (required), Anthropic (optional) |

The 2 GB floor is about `npm run build`, not serving — the build runs on the box
and will OOM on a 1 GB instance. If you are stuck on 1 GB, add swap or build the
image elsewhere and push it to a registry.

Port `80` has to stay open even though all traffic ends up on `443`: Let's
Encrypt validates the domain over HTTP, and Caddy redirects human visitors up to
HTTPS.

## 2. One-time server setup

```bash
ssh root@<instance-ip>

# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh

git clone https://github.com/AwkAmr/Jazo-Hack-Kentucky-2026.git
cd Jazo-Hack-Kentucky-2026
```

## 3. Configure

```bash
cp .env.example .env
nano .env   # set JAZO_DOMAIN, ACME_EMAIL, and the API keys
```

Don't skip the `cp`. `docker compose build` works without `.env`, but
`docker compose up` stops with `env file ... .env not found` — deliberately, so
you can't boot a server with no API keys. Leaving `JAZO_DOMAIN` blank fails
differently and less obviously (`server block without any key`), so set it.

Variable names are **case-sensitive on Linux**. A typo that worked on a Windows
dev machine surfaces here as a `500` from `/api/tts`, not as a startup error.

## 4. Deploy

```bash
docker compose up -d --build
```

First boot takes a couple of minutes: image build, then Caddy requests a
certificate. Watch it land:

```bash
docker compose logs -f caddy
```

## 5. Verify

```bash
# Does the server see its keys? Booleans only, never the values.
curl https://<your-domain>/api/health
# {"status":"ok","uptimeSeconds":12,"config":{"gemini":true,"elevenlabs":true,"anthropic":true}}

docker compose ps   # jazo should read "healthy"
```

Then open `https://<your-domain>` in a browser and confirm the padlock. Start an
interview, hold SPACE, and check the mic prompt appears — that is the only real
proof TLS is doing its job.

## 6. Redeploy

```bash
git pull && docker compose up -d --build
```

Certificates survive this; they live in the `caddy_data` volume. Don't
`docker compose down -v`, which deletes that volume and re-requests a
certificate — repeat that a few times and you'll hit Let's Encrypt rate limits.

---

## Do not run more than one app replica

Interview transcripts live in process memory (`src/lib/interviewStore.ts`, pinned
to `globalThis`). `/api/mcp` and `/api/generate-story` read through that store,
so the container that generates the story must be the one that recorded the
interview.

`docker compose up --scale jazo=2` will appear to work and then fail
intermittently at story generation, when the request lands on the replica that
never saw the transcript. Staying at one replica is a deliberate constraint;
lifting it means moving the store to Redis or a database first.

## Troubleshooting

**Microphone never prompts.** You are on `http://`, or on an IP rather than the
domain. Check the padlock. This is a browser policy — nothing in the app can work
around it.

**`/api/health` reports `elevenlabs: false`.** The key is missing or the variable
name's case is wrong in `.env`. Fix and `docker compose up -d` (no rebuild
needed — keys are read at request time, not baked into the image).

**Certificate never issues.** Almost always DNS: confirm the A record resolves to
this instance (`dig +short <your-domain>`) and that port `80` is open in the
Vultr firewall. `docker compose logs caddy` names the actual failure.

**Want to check the stack before DNS is ready?** Set `JAZO_DOMAIN=localhost` in
`.env` and `docker compose up -d`. Caddy issues a cert from its own internal CA
instead of calling Let's Encrypt, so `curl -k https://localhost/api/health`
exercises the real proxy and TLS path on the box. Set the domain back afterwards.

**Jazo's audio is delayed or arrives all at once.** Something between the browser
and the app is buffering the `/api/tts` stream. Caddy is configured with
`flush_interval -1` and the app sends `X-Accel-Buffering: no`; if you've put a
Vultr Load Balancer or a CDN in front, it needs the same treatment.

**Interview turns time out.** `/api/chat` gives each Gemini model 8s and falls
through a cascade, retrying forever. If all models fail the request hangs rather
than erroring — check `docker compose logs jazo` for `[Fallback System]` lines.
