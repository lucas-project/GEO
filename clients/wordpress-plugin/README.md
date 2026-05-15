# GEO AI OS — WordPress Plugin

WordPress plugin that connects your WP site to the GEO AI Operating System backend. Audit your site for AI search visibility and auto-inject GEO-optimized markup (FAQ JSON-LD, AI summaries, llms.txt) without touching theme files.

## Install (development)

1. Copy this folder to `wp-content/plugins/geo-ai-os/` of your WordPress site (Local, LocalWP, MAMP, etc).
2. Activate **GEO AI OS** under **Plugins**.
3. Go to **GEO AI OS** in the admin sidebar and set the **API URL** (default `http://localhost:3000`).
4. Click **Run GEO Audit** — the audit runs against your live site URL via the backend.
5. Once an audit completes, click **Generate FAQ schema + auto-inject** to add FAQPage JSON-LD to your site's `<head>` automatically.

## File layout

```
wordpress-plugin/
├── geo-ai-os.php                          # Plugin bootstrap
├── includes/
│   ├── class-geo-api.php                  # REST client (wp_remote_* wrapper)
│   ├── class-geo-admin.php                # Admin UI / settings / actions
│   └── class-geo-schema-injector.php      # wp_head injector for generated artifacts
└── README.md
```

## What's implemented (Phase 3 skeleton)

| Capability | Status |
| --- | --- |
| One-click GEO audit of any URL | ✅ |
| Display overall score + narrative | ✅ |
| Generate + auto-inject FAQ JSON-LD on `wp_head` | ✅ |
| Generate llms.txt (served as `/llms.txt`) | TODO — backend produces the content, plugin doesn't yet route it |
| AI summary block injection via `the_content` filter | TODO |
| Answer-first lead-paragraph rewrites | TODO |
| Per-post audits (post meta) | TODO |
| Continuous monitoring (cron) | TODO |

The TODOs are intentional Phase 4+ work; the plugin's interface and admin hooks
are already structured so adding them is mechanical.

## Why a plugin?

WordPress is by far the most common CMS on the open web. A plugin makes
GEO optimization a 1-click experience for the largest CMS audience and is
listed in the blueprint as a "very important commercial distribution channel"
(Section 4.3).
