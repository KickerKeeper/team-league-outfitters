// Comprehensive site documentation for the AI assistant
export const SITE_DOCUMENTATION = `
# Team & League Outfitters — Site Documentation

## Business Overview
Team & League Outfitters is a sports team uniform and custom apparel shop in Georgetown, MA.
Owner: Jamie Nadeau. Founded 2013 (formerly The Soccer Shoppe).
Address: 103 E Main St #2, Georgetown Building Supply Plaza, Georgetown, MA 01833
Phone: (978) 352-8240 / (978) 360-4359
Email: orders@teamleagueoutfitters.com
Hours: Wed-Fri 11am-5pm, Sat 8am-Noon

## Services Offered
1. Team Uniforms — jerseys, shorts, socks for soccer, basketball, baseball
2. Custom Apparel — sweatshirts, t-shirts, warm-ups
3. Spirit Wear — team-branded casual apparel
4. Embroidery — logos, names, team crests
5. Screen Printing — high-volume printed apparel
6. Heat Press — vinyl numbers, letters, logos

## How Orders Work
1. Customer submits order form on the website (or emails directly)
2. Order appears in the admin inbox at /admin/inbox
3. Jamie reviews and confirms the order details
4. Customer comes in for fittings if needed
5. Order goes into production (heat press, embroidery, etc.)
6. Customer picks up at the shop or order is shipped

## Website Pages (Public)
- / (Homepage) — hero, trust bar, services overview, how it works, testimonials, CTA
- /services — 6 service cards, detailed 4-step process
- /gallery — 10 team photos with lightbox viewer
- /about — business story, differentiators
- /order — order form (primary CTA) with 12 fields in 3 sections
- /contact — phone, email, hours, Google Maps
- /status — customer order status lookup (enter email to see pipeline stage)
- /privacy — privacy policy
- /404 — custom error page

## Order Form Fields
Section 1 "Your Info": Contact Name*, Email*, Phone*
Section 2 "Team Details": Team/Org Name*, Sport* (Soccer/Basketball/Baseball/Other), Team Colors*, Number of Players*, Sizes & Quantities, Uniform Numbers
Section 3 "How You Want It": Customization Type (Heat Press/Embroidery/Screen Printing), Pickup or Ship*, Additional Notes

## Admin Portal (/admin)
Login: /admin/login
Default credentials: admin / TLO2026! (change via ADMIN_USER and ADMIN_PASS env vars)
Session: 8 hours, HttpOnly cookie

### Admin Dashboard (/admin/dashboard)
- Page views, unique visitors, avg views/day, top page
- Traffic over time bar chart (hover for daily counts)
- Top pages, devices, browsers, referrers tables
- Period selector: 7, 14, or 30 days

### Admin Inbox (/admin/inbox)
The inbox manages all customer communications:

**List View (left panel):**
- Toggle between Orders and Emails tabs
- Stage filter for orders: All, Review, Prod, Ready, Done
- Search by name, team, or organization
- Each item shows name, preview, stage tag, date
- Blue dot = unread/new, auto-refreshes every 30 seconds

**Detail View (right panel):**
- Contact info (clickable email and phone links)
- Order fields grouped into sections (Contact, Team Details, Sizing, Preferences)
- Step flow graphic for orders (4 stages, click circle to change)
- Email tab: compose and send emails to customer, view thread
- Notes tab: internal notes only visible to admin
- Delete button (with confirmation)
- Download icon for CSV export of all orders

**Order Stages (pipeline):**
1. Needs Review — new order just received, needs to be reviewed
2. In Production — confirmed, being made
3. Ready for Pickup — done, waiting for customer
4. Picked Up — customer collected, order complete

**Stage change behavior:**
- Click the numbered circle in the step flow to change stage
- Clicking current stage does nothing
- Auto-emails are sent to customer on stage transitions:
  - "In Production": confirms order is being made
  - "Ready for Pickup": pickup details with address and hours
  - "Picked Up": thank you + Google review request

### Email System
- Outbound: sends from orders@teamleagueoutfitters.com via Resend API
- Inbound: customers reply to emails, replies flow into the inbox thread
- Email threading: uses In-Reply-To and References headers so emails group in Gmail
- Confirmation email: auto-sent when customer submits order form, includes order summary
- Reply chain stripping: removes quoted content from inbound emails for clean display
- Click any email in the thread to see full email content in a modal

### Analytics Tracking
- Custom tracker on every public page (no cookies, privacy-friendly)
- Tracks: page path, referrer, device type, browser, visitor ID (localStorage)
- Data stored in Netlify Blobs, aggregated daily
- Dashboard reads and displays the aggregated data

## Tech Stack
- Framework: Astro (SSR mode with Netlify adapter)
- Hosting: Netlify (free tier)
- Storage: Netlify Blobs (inbox data, analytics, feature specs)
- Email: Resend API (sending + inbound webhooks)
- Domain: teamleagueoutfitters.com
- DNS: Namecheap
- GitHub: KickerKeeper/team-league-outfitters (auto-deploys on push to main)

## Environment Variables (Netlify)
- ADMIN_USER — admin username
- ADMIN_PASS — admin password
- SESSION_SECRET — session signing key
- RESEND_API_KEY — Resend API key for email
- RESEND_FROM — from address for outbound emails
- RESEND_WEBHOOK_SECRET — webhook signature verification
- RESEND_INBOUND_DOMAIN — domain for reply-to addresses
- GEMINI_API_KEY — Google Gemini API key for assistant

## Security
- Session auth with HMAC-signed cookies (HttpOnly, Secure, SameSite=Strict)
- Webhook signature verification on inbound emails (svix)
- Rate limiting: 5 submissions/min, 30 analytics events/min per IP
- CSP headers, X-Frame-Options, X-Content-Type-Options
- Admin routes protected by middleware

## Common Workflows

### Processing a New Order
1. Order appears in inbox with "Needs Review" stage
2. Review the order details (team, sport, sizes, customization)
3. Send an email to customer confirming details or asking questions
4. When confirmed, click step 2 "In Production" — auto-email sent
5. When done, click step 3 "Ready for Pickup" — auto-email with address sent
6. When picked up, click step 4 "Picked Up" — thank you email sent

### Responding to Customer Email
1. Customer reply shows up in the order's email thread
2. Click on the order in the inbox list
3. In the Emails tab, type your response in the compose box
4. Click "Send Email" — sent from orders@teamleagueoutfitters.com

### Adding Internal Notes
1. Open the order
2. Switch to the "Notes" tab
3. Type your note and click "Add Note"
4. Notes are only visible in admin, never sent to customer

### Exporting Data
1. Click the download icon (↓) next to the refresh button in the inbox header
2. Downloads a CSV file with all orders

### Checking Analytics
1. Go to /admin/dashboard
2. Select time period (7, 14, or 30 days)
3. View page views, visitors, top pages, devices, referrers
`;
