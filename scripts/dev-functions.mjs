/**
 * Dev-only Vite plugin: mount the Cloudflare Pages Functions from `functions/`
 * onto the Astro dev server.
 *
 * Cloudflare Pages picks up `functions/` automatically at deploy time, but
 * `astro dev` only knows about `src/` + `public/`, so POST /api/contact would
 * 404 locally. This middleware bridges that gap so `npm run dev` behaves like
 * production. It only runs in dev (`apply: "serve"`), so the build output is
 * untouched — Cloudflare still executes the real Pages Function.
 *
 * Env vars come from `.dev.vars` (the same file `wrangler pages dev` reads),
 * with real shell env taking precedence so you can override a secret locally:
 *   $env:RESEND_API_KEY="re_fake"; npm run dev
 */
import fs from "node:fs";
import path from "node:path";

const FUNCTIONS_DIR = "functions";
const METHODS = ["Get", "Post", "Put", "Patch", "Delete", "Head", "Options"];

/** Read KEY=VALUE pairs from a dotenv-style file (.dev.vars, .env). */
function parseDotEnv(file) {
  const vars = {};
  if (!fs.existsSync(file)) return vars;

  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length > 1 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    if (key) vars[key] = value;
  }
  return vars;
}

/** Map a request pathname to a Pages Function file, or null if none exists. */
function resolveFunction(root, pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  const base = path.resolve(root, FUNCTIONS_DIR);
  const candidates = [
    path.join(base, ...segments) + ".js",
    path.join(base, ...segments) + ".ts",
    path.join(base, ...segments, "index.js"),
    path.join(base, ...segments, "index.ts"),
  ];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    // Never let a crafted URL escape the functions/ directory.
    if (!resolved.startsWith(base + path.sep)) continue;
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

/** Vite plugin: serve `functions/**` on the dev server, Pages-compatible. */
export default function devFunctions() {
  let root = process.cwd();
  let fileEnv = {};

  return {
    name: "dev-functions",
    apply: "serve",

    configResolved(config) {
      root = config.root;
      fileEnv = {
        ...parseDotEnv(path.join(root, ".env")),
        ...parseDotEnv(path.join(root, ".dev.vars")),
      };
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const file = resolveFunction(root, url.pathname);
        if (!file) return next();

        try {
          const mod = await server.ssrLoadModule(file);
          const method = (req.method || "GET").toUpperCase();
          const exportName = "onRequest" + method[0] + method.slice(1).toLowerCase();
          const handler = mod[exportName] || mod.onRequest;

          if (typeof handler !== "function") {
            const allowed = METHODS.filter((m) => typeof mod["onRequest" + m] === "function")
              .map((m) => m.toUpperCase())
              .join(", ");
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            if (allowed) res.setHeader("Allow", allowed);
            res.end(JSON.stringify({ ok: false, error: `${method} is not supported on ${url.pathname}.` }));
            return;
          }

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
          }

          const request = new Request(new URL(url.pathname + url.search, `http://${req.headers.host || "localhost"}`), {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : await readBody(req),
          });

          const response = await handler({
            request,
            env: { ...fileEnv, ...process.env },
            params: {},
            data: {},
            next: () => new Response(null, { status: 404 }),
            functionPath: url.pathname,
          });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
