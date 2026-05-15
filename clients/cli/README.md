# `@geo-ai-os/cli`

Command-line client for the GEO AI Operating System. Talks to the local (or remote) GEO API over HTTP — no local DB or browser required.

## Install

From this folder:

```bash
npm install
npm link
```

Or from anywhere once published:

```bash
npx geo-audit https://example.com
```

## Usage

```bash
# Quick audit (one-shot binary)
geo-audit https://example.com

# Multi-command
geo audit https://example.com
geo simulate "best VRF air conditioning Australia" --brand=Daikin
geo compare https://you.com https://competitor.com
geo fix <auditId> faq-schema
geo agent "Analyze my AI visibility for example.com"
```

## Configuration

Set `GEO_API_URL` to point at your deployed backend (defaults to `http://localhost:3000`):

```bash
GEO_API_URL=https://geo.yourcompany.com geo audit https://example.com
```

## Commands

| Command | Description |
| --- | --- |
| `geo audit <url>` | Run a full 10-dimension GEO audit |
| `geo simulate "<prompt>"` | Simulate ChatGPT / Gemini / Claude / Perplexity, aggregate citations |
| `geo compare <target> <competitor>…` | Diff target vs up to 5 competitors |
| `geo fix <auditId> <type>` | Generate a fix artifact (faq-schema, llms-txt, ai-summary, answer-first, product-schema, metadata) |
| `geo agent "<goal>"` | Dispatch the autonomous planner |
