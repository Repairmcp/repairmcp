# @repairmcp/site

The public site at repairmcp.com. One HTML page, one stylesheet, no scripts, no
web fonts, no cookies, no analytics, no third-party requests of any kind.

Served as Cloudflare Workers static assets. There is no `main` in
`wrangler.jsonc`, so no Worker code runs and no request is billed as an
invocation. Every response header comes from `public/_headers`.

```
public/
  index.html      the whole site: hero, proof, Claude setup, ChatGPT setup, trust, what's next
  styles.css      one stylesheet
  404.html
  robots.txt      LAUNCH GATE: currently Disallow: /
  _headers        security headers + LAUNCH GATE: X-Robots-Tag noindex
  favicon.svg
  img/            screenshots. Placeholders until Travis shoots them
```

## Commands

```bash
cd apps/site
bun run test        # copy linter (scripts/check-copy.ts). Runs on `bun run test` at the root too
bun run dev         # wrangler dev, http://127.0.0.1:8787
bun run deploy      # wrangler deploy, to preview.repairmcp.com
bun run shots       # regenerate placeholder images, skipping any real screenshot
```

## Why Workers static assets and not Pages

Pages' one real advantage here was a free `*.pages.dev` preview hostname
without touching DNS, and that stopped mattering once the `repairmcp.com` zone
went active: `preview.repairmcp.com` is one line of config and Cloudflare
provisions the record and the certificate itself. Against that, Pages would mean
a second product, a second deploy model, and a second dashboard, alongside the
`wrangler deploy` this repo already runs for `deg-server`. Pages also has no
versions or gradual deployments.

`docs/ARCHITECTURE.md` used to say Pages. That line predates the zone landing on
Cloudflare and has been updated.

## The copy rules are enforced, not remembered

`scripts/check-copy.ts` fails the build on em dashes and en dashes anywhere,
a list of hype and industry jargon, the acronym MCP appearing more than once or
unexpanded, an `<img>` missing `alt`/`width`/`height`, and anything the
Content-Security-Policy would silently kill (`<script>`, `<form>`, inline
`style=`, plain `http://`).

If you are adding copy and the linter blocks a word you actually need, change
the list and say why in the commit. Do not work around it.

---

# Launch runbook

**The site is preview-only on purpose.** Two things gate it: Travis's own
launch prerequisite, and the fact that `repairmcp.com` and `www` still carry
orphaned Namecheap parking records.

Verified state before launch:

| Hostname | Now |
|---|---|
| `repairmcp.com` | **522**, Cloudflare cannot reach the parked origin |
| `www.repairmcp.com` | **525**, origin TLS handshake fails |
| `deg.repairmcp.com` | 200, the live MCP endpoint. Do not touch |
| `preview.repairmcp.com` | 200, this site, served `noindex` |

## Step 1. DNS, in the Cloudflare dashboard (Travis, by hand)

Wrangler will not delete a record that is in its way. It has to be cleared first
or the apex custom domain fails to provision.

**Delete:**

- the `A` record on `@` / `repairmcp.com`
- the `A` and `AAAA` records on `www`

**Do not touch, these are live:**

- the five `MX` records pointing at `eforward1` through `eforward5.registrar-servers.com`
- the `TXT` record `v=spf1 include:spf.efwd.registrar-servers.com ~all`
- anything on `deg`

Those MX and SPF records are Namecheap **email forwarding**, not parking. They
look like leftovers and they are not. Deleting them silently kills every address
at the domain, and nothing will tell you it happened.

## Step 2. Attach the apex

In `wrangler.jsonc`, add the apex to `routes`:

```jsonc
"routes": [
  { "pattern": "repairmcp.com", "custom_domain": true },
  { "pattern": "preview.repairmcp.com", "custom_domain": true }
]
```

`wrangler deploy`. Cloudflare creates the DNS record and issues the certificate.
Nothing to add by hand.

## Step 3. Open it to search engines

Both of these are marked `LAUNCH GATE` in the files themselves.

- `public/_headers`: delete the `X-Robots-Tag: noindex, nofollow` line
- `public/robots.txt`: replace `Disallow: /` with `Allow: /`

`wrangler deploy` again.

## Step 4. www

`www` needs a proxied DNS record to reach Cloudflare's edge at all, so it gets
replaced rather than just deleted.

1. Create a **proxied** `CNAME` `www` → `repairmcp.com` (orange cloud on).
2. Rules > Redirect Rules, create one: when hostname equals `www.repairmcp.com`,
   redirect to `https://repairmcp.com/${http.request.uri.path}`, status **301**,
   preserve query string.

Free plan allows this and it needs no Worker.

## Step 5. HSTS

Not in `_headers` on purpose. HSTS with `includeSubDomains` set from this site
would apply to `deg.repairmcp.com` too, which is not this project's call to
make. If it is wanted, turn it on at the zone level in SSL/TLS > Edge
Certificates, where the blast radius is visible.

## Step 6. Verify on the wire

```bash
curl -sI https://repairmcp.com/ | head -1                    # 200
curl -sI https://repairmcp.com/ | grep -i x-robots-tag       # must print NOTHING
curl -sI https://www.repairmcp.com/ | head -2                # 301 to the apex
curl -s  https://repairmcp.com/robots.txt                    # Allow: /
curl -s  https://deg.repairmcp.com/health                    # still 200, records 22652
```

The `x-robots-tag` check is the one that gets forgotten. If it still prints,
the site is live and invisible to search.

## Step 7. Retire the preview

Drop `preview.repairmcp.com` from `routes`, `wrangler deploy`, then delete the
leftover `preview` DNS record in the dashboard.

---

## Keeping the numbers honest

`index.html` hard-codes the corpus size in three places: the description meta
tag, the hero, and the stat grid. It is a constant because the site ships no
scripts, so there is nothing to fetch a live count with.

**After every corpus refresh**, bump it in the same pass as `CORPUS_VERSION` in
`apps/deg-server/wrangler.jsonc`. The current value comes from
`https://deg.repairmcp.com/health`:

```bash
curl -s https://deg.repairmcp.com/health
```
