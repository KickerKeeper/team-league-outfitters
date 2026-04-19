# Georgetown Jerseys — Launch Checklist

Site code is rebranded and building clean. This is everything you (owner) need to do outside the repo before going live at **gtownjerseys.com**.

## 1. Domains on Netlify

- Log into Netlify → site dashboard → **Domain management**
- Add `gtownjerseys.com` (apex) and `www.gtownjerseys.com`
- Add `teamleagueoutfitters.com` and `www.teamleagueoutfitters.com` as secondary domains
- Set **`gtownjerseys.com`** as the **primary domain** → Netlify will automatically issue `301` redirects from the secondary domains to the primary
- Let Netlify provision Let's Encrypt certs for all four

## 2. DNS (at your registrar)

For each domain, point at Netlify. Two patterns work:

- **Apex (`gtownjerseys.com`, `teamleagueoutfitters.com`):** `A` record to Netlify's load balancer IP (Netlify shows the current IP in the domain panel), or use `ALIAS`/`ANAME` if your registrar supports it.
- **www (`www.gtownjerseys.com`, `www.teamleagueoutfitters.com`):** `CNAME` to `<your-site>.netlify.app`

Netlify's domain panel shows the exact values to copy.

## 3. Resend (outbound email) domain verification

- Resend dashboard → **Domains** → **Add Domain** → `gtownjerseys.com`
- Copy the SPF, DKIM, and DMARC records it gives you → paste into your DNS
- Wait for verification (usually a few minutes, can take up to a few hours)
- In Resend → **API Keys**, confirm the existing key still works for the new domain, or regenerate

## 4. Resend inbound (customer replies flowing into the admin inbox)

- Resend dashboard → **Inbound Email** → add `gtownjerseys.com`
- Point MX records per Resend's instructions (replace any MX records currently serving `@teamleagueoutfitters.com`)
- Set the inbound webhook URL to `https://gtownjerseys.com/api/inbox/inbound` (Resend webhook dashboard)
- Set or keep the same `RESEND_WEBHOOK_SECRET`

## 5. Mail provider — `orders@gtownjerseys.com` mailbox

If you use Google Workspace, Fastmail, Zoho, etc. for real mailbox (separate from Resend sending):
- Create `orders@gtownjerseys.com` as a real mailbox
- Optionally forward `orders@teamleagueoutfitters.com` → `orders@gtownjerseys.com` so the old address still routes
- Optionally forward `teamleagueoutfitters@comcast.net` → `orders@gtownjerseys.com` (the site no longer advertises the Comcast address)

## 6. Netlify environment variables

Site dashboard → **Site configuration → Environment variables**. Update:

| Variable | New value |
|---|---|
| `RESEND_FROM` | `Georgetown Jerseys <orders@gtownjerseys.com>` |
| `RESEND_INBOUND_DOMAIN` | `gtownjerseys.com` |

Leave `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `GEMINI_API_KEY` as they are.

Trigger a redeploy after saving.

## 7. Logos and favicon (manual design work)

The binary image files still visually say "Team & League Outfitters". Replace before launch:

- `public/images/logo/logo-horizontal.png` — wordmark in site header
- `public/images/logo/logo-stacked.png` — used in Open Graph previews (SEO/social)
- `public/images/logo/logo-icon.png` — Apple touch icon
- `public/favicon.png` — browser tab icon

Keep the same filenames so no code changes are needed — just overwrite with new artwork.

## 8. Google Business Profile

- Log into Google Business Profile
- Change the business name to **Georgetown Jerseys** (or your preferred legal/DBA display)
- Update the website URL to `https://gtownjerseys.com`
- In **Edit profile → Short name**, claim `gtownjerseys` (or whatever short-name you want)

**Heads up:** the "order picked up" auto-email in `src/pages/api/inbox/update.ts` currently points customers to `https://g.page/r/teamleagueoutfitters/review`. After you change the Google short-name, update this URL in code (one-line edit) or the link will 404 for new Google profiles. If you keep `teamleagueoutfitters` as a Google short-name alias it will keep working.

## 9. Google Search Console

- Register `gtownjerseys.com` as a new property
- Under the old `teamleagueoutfitters.com` property → **Settings → Change of address** → point to `gtownjerseys.com`
- Submit the new sitemap: `https://gtownjerseys.com/sitemap-index.xml`

This is what preserves your existing SEO rankings.

## 10. External listings to update

- BBB listing (website URL + business name)
- GYSA approved supplier listing
- Boxford AA / Masco Youth Soccer partner pages (if they link to you)
- Any Facebook / Instagram / social profiles (bio URL)

## 11. Optional — GitHub repo rename

Current repo: `KickerKeeper/team-league-outfitters`

If you want the repo to match the new brand:
- GitHub repo settings → Rename → `georgetown-jerseys`
- Netlify → site → **Build & deploy → Link repository** → relink to the new repo name (GitHub forwards the old name but relinking is cleaner)
- Update the repo mention in `src/lib/site-docs.ts` (currently reads `KickerKeeper/team-league-outfitters`)

Skip this step if you'd rather not re-link Netlify.

## 12. Smoke test after launch

- Open `https://gtownjerseys.com/` — everything loads, header/footer show "Georgetown Jerseys"
- Open `https://teamleagueoutfitters.com/` — 301s to the new domain
- Submit a test order through `/order` — confirmation email arrives from `orders@gtownjerseys.com`
- Reply to the confirmation email — it appears in `/admin/inbox` thread
- Log into `/admin/login`, advance an order through the pipeline — stage-transition emails send correctly
