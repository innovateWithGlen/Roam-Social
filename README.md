# ROAM SOCIAL

The official website for **ROAM SOCIAL** — a luxury mobile bar in Bengaluru built
around a vintage Jeep bar, serving craft cocktails and social bites at weddings,
pop-ups, corporate events and private parties.

**Live site:** https://roam-social-chi.vercel.app

## About the project

A fast, fully static marketing site designed to turn event planners and couples
into booking enquiries, while carrying the brand's dark, gold-accented "golden
hour" aesthetic across every screen.

Highlights:

- **Single-page brand experience** — hero, brand story, cocktail & bites menu,
  photo gallery, mobile-bar concept, Instagram reels and a booking form.
- **Booking enquiries that actually arrive** — the contact form posts to a
  Cloudflare Pages Function (`/api/contact`) that validates input and delivers
  the lead to the team inbox through Resend, with a honeypot, minimum
  time-to-submit and IP rate limiting to keep spam out.
- **Performance-first** — Astro ships zero client-side JavaScript by default,
  reels are lazy-loaded with poster images, and the whole site builds to static
  HTML.
- **Discoverability baked in** — per-page metadata, canonical URLs, Open Graph
  and Twitter cards, `FoodEstablishment` structured data, sitemap and
  `robots.txt`.
- **Legal coverage** — dedicated privacy and terms pages via a shared legal
  layout.

## Tech stack

| Layer      | Choice                                  |
| ---------- | --------------------------------------- |
| Framework  | Astro 5 (static output)                 |
| Styling    | Tailwind CSS v4 + custom design tokens  |
| Deployment | Cloudflare Pages                        |
| Forms      | Cloudflare Pages Functions + Resend API |
| Extras     | `@astrojs/sitemap`, SEO/OG metadata     |

## Project structure

```text
functions/api/contact.js   Cloudflare Pages Function — booking form endpoint
scripts/                   Local dev helpers (emulates Pages Functions)
src/components/            Header, Hero, Menu, Gallery, Reels, ContactForm, …
src/layouts/               Base layout (SEO, fonts, JSON-LD) + legal layout
src/pages/                 index.astro, privacy.astro, terms.astro
src/styles/global.css      Tailwind import and brand design tokens
public/                    Static assets, favicons, manifest, robots.txt
```

## Getting started

```bash
npm install
npm run dev        # http://localhost:4321
```

## Testing the contact form

The contact endpoint runs as a Cloudflare Pages Function, so plain
`astro dev` will 404 that route. To exercise it locally, build and serve through
Wrangler with a local secrets file:

```bash
cp .dev.vars.example .dev.vars   # then add your real RESEND_API_KEY
npm run preview:pages
```

`.dev.vars` is gitignored — never commit real keys.

## Build & deploy

```bash
npm run build      # outputs the static site to dist/
```

Deploy `dist/` together with the `functions/` directory to Cloudflare Pages,
then set `RESEND_API_KEY` (and optionally `RESEND_FROM`) as encrypted
environment variables in the Pages project settings.
