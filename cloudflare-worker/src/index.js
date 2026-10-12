const REPO = "Nush-Saludable/Nush";
const BRANCH = "main";
const FILE = "catalog-data.json";
const ALLOWED_ORIGIN = "https://nush-saludable.github.io";

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-password",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin), "Cache-Control": "no-store" }
  });
}
function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function github(path, env, options = {}) {
  return fetch("https://api.github.com/repos/" + REPO + "/contents/" + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Nush-Store-Admin",
      ...(options.headers || {})
    }
  });
}
async function readCatalog(env) {
  const r = await github(FILE + "?ref=" + encodeURIComponent(BRANCH), env);
  if (!r.ok) throw new Error("No se pudo leer el catálogo de GitHub (" + r.status + ")");
  const data = await r.json();
  let catalogText = "";
  if (typeof data.content === "string" && data.content.trim()) {
    catalogText = decodeBase64Utf8(data.content);
  } else {
    // GitHub puede omitir el contenido en la API Contents cuando el archivo es grande.
    // En ese caso, leer el archivo desde la URL raw pública del repositorio.
    const rawUrl = data.download_url || ("https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + FILE);
    const raw = await fetch(rawUrl, { headers: { "Cache-Control": "no-cache" } });
    if (!raw.ok) throw new Error("GitHub no entregó el catálogo por la API ni por descarga directa (" + raw.status + ")");
    catalogText = await raw.text();
  }
  if (!catalogText.trim()) throw new Error("GitHub devolvió un catálogo vacío");
  let catalog;
  try { catalog = JSON.parse(catalogText); }
  catch { throw new Error("El catálogo de GitHub no contiene JSON válido"); }
  return { catalog, sha: data.sha };
}
async function saveCatalog(env, catalog) {
  const current = await github(FILE + "?ref=" + encodeURIComponent(BRANCH), env);
  if (!current.ok) throw new Error("No se pudo preparar el guardado en GitHub (" + current.status + ")");
  const { sha } = await current.json();
  catalog.updatedAt = new Date().toISOString();
  const response = await github(FILE, env, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Actualizar catálogo Nush desde el panel",
      branch: BRANCH,
      sha,
      content: encodeBase64Utf8(JSON.stringify(catalog, null, 2))
    })
  });
  if (!response.ok) throw new Error("GitHub rechazó el guardado (" + response.status + ")");
  return catalog.updatedAt;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (!["GET", "PUT"].includes(request.method)) return json({ ok: false, message: "Método no permitido" }, 405, origin);
    if (!env.GITHUB_TOKEN) return json({ ok: false, message: "Falta configurar el secreto GITHUB_TOKEN en Cloudflare" }, 503, origin);

    try {
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "nush-api" }, 200, origin);
      if (url.pathname === "/api/catalog" && request.method === "GET") {
        const { catalog } = await readCatalog(env);
        const products = (catalog.products || []).map(p => {
          const spice = /especias|condimentos/i.test(String(p.cat || ""));
          const price = g => {
            const key = "price" + (g === 50 ? 100 : g === 200 ? 500 : g);
            if (p[key] != null && p[key] !== "" && Number.isFinite(Number(p[key]))) return Number(p[key]);
            const marginKey = "margin" + (g === 50 ? 100 : g === 200 ? 500 : g);
            const margin = Number(p[marginKey] ?? p.margin ?? 40);
            return Math.round(Number(p.cost || 0) * g / 1000 * (1 + margin / 100));
          };
          return {
            code: p.code, name: p.name, cat: p.cat, desc: p.desc || "",
            image: p.image || null, available: p.available !== false, spice,
            prices: spice ? { 50: price(50), 200: price(200), 1000: price(1000) } :
              { 100: price(100), 500: price(500), 1000: price(1000) }
          };
        });
        const configs = catalog.config || {};
        const categories = Array.isArray(configs.categories) ? configs.categories : [];
        const map = new Map(categories.filter(c => c && c.name).map(c => [String(c.name).trim().toLowerCase(), c]));
        for (const p of catalog.products || []) {
          const name = String(p.cat || "Otros").trim();
          if (name && !map.has(name.toLowerCase())) map.set(name.toLowerCase(), { name, active: true, image: null });
        }
        return json({
          products, updatedAt: catalog.updatedAt,
          promotions: configs.promotions || [],
          categories: [...map.values()].filter(c => c.active !== false)
        }, 200, origin);
      }
      if (url.pathname === "/api/admin/catalog") {
        if (request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD || !env.ADMIN_PASSWORD) {
          return json({ ok: false, message: "Contraseña incorrecta o panel no configurado" }, 401, origin);
        }
        if (request.method === "GET") {
          const { catalog } = await readCatalog(env);
          return json(catalog, 200, origin);
        }
        const body = await request.json();
        if (!body || !Array.isArray(body.products) || !body.config) return json({ ok: false, message: "Datos inválidos" }, 400, origin);
        body.config.promotions = Array.isArray(body.config.promotions) ? body.config.promotions : [];
        body.config.categories = Array.isArray(body.config.categories) ? body.config.categories : [];
        const updatedAt = await saveCatalog(env, { products: body.products, config: body.config });
        return json({ ok: true, persistent: "github", updatedAt }, 200, origin);
      }
      return json({ ok: false, message: "Ruta no encontrada" }, 404, origin);
    } catch (error) {
      return json({ ok: false, message: error.message || "Error interno" }, 500, origin);
    }
  }
};
