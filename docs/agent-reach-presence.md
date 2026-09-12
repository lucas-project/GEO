# Agent Reach — presence probe enrichment (optional)

GEO can call **host-installed** CLI tools from [Agent Reach](https://github.com/Panniantong/agent-reach) to supplement Bing/SERP discovery for Xiaohongshu, Reddit, and Zhihu titles. Tools are **not** installed into this repo; they live on your machine PATH or user home (`~/.agent-reach/`).

## Enable in GEO

```env
PRESENCE_PROBE_AGENT_REACH=1
# Optional: Reddit via rdt-cli instead of only reddit-json
# PRESENCE_PROBE_AGENT_REACH_RDT=1
```

Defaults when the master switch is on: Xiaohongshu (`xhs`) and Zhihu Jina enrichment on; Reddit stays on `reddit-json` unless `PRESENCE_PROBE_AGENT_REACH_RDT=1`.

## Windows setup (one-time)

### 1. Install CLIs

**If `pipx` is not recognized** (common on Windows), use a dedicated venv instead:

```powershell
python -m venv $env:USERPROFILE\.agent-reach-venv
& $env:USERPROFILE\.agent-reach-venv\Scripts\python.exe -m pip install xiaohongshu-cli
```

Then point GEO at the venv binary in `.env` (use your Windows username):

```env
PRESENCE_PROBE_AGENT_REACH=1
XHS_CLI=C:\Users\YOUR_USER\.agent-reach-venv\Scripts\xhs.exe
```

Optional Reddit CLI:

```powershell
& $env:USERPROFILE\.agent-reach-venv\Scripts\python.exe -m pip install rdt-cli
RDT_CLI=C:\Users\YOUR_USER\.agent-reach-venv\Scripts\rdt.exe
```

**If you have pipx** (`python -m pip install pipx` then restart the terminal):

```powershell
pipx install xiaohongshu-cli
pipx install rdt-cli
```

If you see `externally-managed-environment` with system Python, use the venv steps above instead.

Or install the full Agent Reach installer: see [install.md](https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md).

### 2. Xiaohongshu login (one-time)

`xhs login` reads cookies from an **installed desktop browser**. Being logged in on xiaohongshu.com in a browser tab is not enough if the CLI cannot read that browser’s cookie store (common on Windows).

**Option A — QR code (most reliable on Windows):**

```powershell
& $env:USERPROFILE\.agent-reach-venv\Scripts\xhs.exe login --qrcode
```

Scan the QR code with the **Xiaohongshu mobile app** (not WeChat). Wait until the CLI reports success.

**Option B — Named browser** (must be the same browser where you are logged in):

```powershell
& $env:USERPROFILE\.agent-reach-venv\Scripts\xhs.exe login --cookie-source chrome
# or: edge | firefox | brave | chromium
```

Before running, open that browser, visit https://www.xiaohongshu.com/, confirm you see your feed logged in, then run the command **without** closing the browser.

**Option C — Cookie-Editor:** export cookies from the browser where you are logged in and follow [Agent Reach xhs-cookies](https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md) (Header String or JSON).

If login fails, GEO keeps SERP-only Xiaohongshu results.

### 3. Verify

```powershell
& $env:USERPROFILE\.agent-reach-venv\Scripts\xhs.exe search "test" --json
```

(`--limit` is not supported on current xhs-cli; GEO uses `--json` and caps results in code.)

### 4. Optional binary paths

If `xhs` / `rdt` are not on PATH:

```env
XHS_CLI=C:\Users\you\.local\bin\xhs.exe
RDT_CLI=C:\Users\you\.local\bin\rdt.exe
```

## What GEO does

| Channel | Tool | When |
|---------|------|------|
| Xiaohongshu | `xhs search` | After SERP supplement; merges into cross-platform posts |
| Reddit (optional) | `rdt search --yaml` | When `PRESENCE_PROBE_AGENT_REACH_RDT=1` |
| Zhihu | Jina Reader `r.jina.ai` | Enriches titles for up to 5 Zhihu URLs already found via SERP |

Without CLIs or cookies, behavior is unchanged (widened Bing/Serper search only).

## Security

- Do not commit cookies or `.env` secrets.
- Prefer a dedicated XHS account for cookie-based access.
- GEO never runs `sudo` or installs packages from the Node process.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| UI hint: xhs auth missing | Run `xhs login` on the same machine as `npm run dev` / the worker |
| `xhs` not found | Install pipx package; set `XHS_CLI` |
| Few Xiaohongshu notes | Rate limits — wait and re-run probe |
| Zhihu titles still thin | Jina may block some URLs; SERP titles remain |
