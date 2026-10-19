// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import devFunctions from "./scripts/dev-functions.mjs";

// Static output + Cloudflare Pages Functions (/functions) is the recommended
// architecture for this site: Astro prerenders every page to dist/, and
// functions/api/contact.js runs as a Pages Function on Cloudflare's edge.
// The @astrojs/cloudflare adapter is only needed for SSR routes; adding it
// here would switch Pages to advanced-mode _worker.js and bypass /functions.
export default defineConfig({
  site: "https://roamsocial.in",
  output: "static",
  compressHTML: true,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss(), devFunctions()],
  },
  build: {
    format: "directory",
  },
});
