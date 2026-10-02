import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize, relative, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3020);
const coreUrl = (process.env.DUME_CORE_URL || "http://127.0.0.1:8767").replace(/\/$/, "");
const appDataDirectory = process.env.APP_DATA_DIRECTORY;
const execFileAsync = promisify(execFile);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const previewCache = new Map();
const previewJobs = new Map();

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function requireUuid(value) {
  if (!uuidPattern.test(value)) throw new Error("Identificador de apresentação inválido.");
  return value;
}

async function coreJson(path, options = {}) {
  const upstream = await fetch(`${coreUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const value = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = value.detail || value.error || `O motor devolveu HTTP ${upstream.status}.`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return value;
}

async function safeExportPath(path) {
  if (!appDataDirectory) throw new Error("APP_DATA_DIRECTORY não está configurado no servidor Dume.");
  const base = await realpath(join(appDataDirectory, "exports"));
  const target = await realpath(path);
  const pathFromBase = relative(base, target);
  if (!pathFromBase || pathFromBase.startsWith("..") || isAbsolute(pathFromBase)) {
    throw new Error("O ficheiro exportado ficou fora da pasta de exportações.");
  }
  return target;
}

async function exportDeck(id, format) {
  const result = await coreJson(`/api/v1/ppt/presentation/${id}/export`, {
    method: "POST",
    body: JSON.stringify({ export_as: format }),
  });
  return safeExportPath(result.path);
}

async function makePreview(id, refresh = false) {
  if (!refresh && previewCache.has(id)) return previewCache.get(id);
  if (previewJobs.has(id)) return previewJobs.get(id);
  const job = (async () => {
    if (!appDataDirectory) throw new Error("APP_DATA_DIRECTORY não está configurado no servidor Dume.");
    const pdf = await exportDeck(id, "pdf");
    const directory = join(appDataDirectory, "dume-previews", id);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await execFileAsync("pdftoppm", ["-f", "1", "-l", "50", "-r", "120", "-png", pdf, join(directory, "slide")], { timeout: 180000 });
    const files = (await readdir(directory)).filter((name) => /^slide-\d+\.png$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!files.length) throw new Error("Não foi possível criar a prévia dos slides.");
    const result = { directory, files };
    previewCache.set(id, result);
    return result;
  })();
  previewJobs.set(id, job);
  try { return await job; } finally { previewJobs.delete(id); }
}

async function proxyCore(request, response, url) {
  const path = url.pathname.slice("/core".length);
  if (!path.startsWith("/api/v1/ppt/")) return json(response, 404, { detail: "Rota indisponível." });
  const headers = { ...request.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];
  delete headers["accept-encoding"];
  const controller = new AbortController();
  response.on("close", () => { if (!response.writableEnded) controller.abort(); });
  const upstream = await fetch(`${coreUrl}${path}${url.search}`, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : Readable.toWeb(request),
    duplex: "half",
    signal: controller.signal,
  });
  const outputHeaders = Object.fromEntries(upstream.headers);
  delete outputHeaders["content-length"];
  delete outputHeaders["content-encoding"];
  delete outputHeaders["transfer-encoding"];
  outputHeaders["cache-control"] = "no-store";
  response.writeHead(upstream.status, outputHeaders);
  if (upstream.body) {
    const stream = Readable.fromWeb(upstream.body);
    stream.on("error", (error) => { if (!response.destroyed) response.destroy(error); });
    stream.pipe(response);
  } else response.end();
}

async function serveStatic(response, pathname) {
  const name = pathname === "/" ? "/index.html" : pathname;
  const path = normalize(join(root, name));
  if (!path.startsWith(root)) return json(response, 403, { detail: "Acesso negado." });
  try {
    const file = await readFile(path);
    response.writeHead(200, { "Content-Type": `${types[extname(path)] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(file);
  } catch {
    json(response, 404, { detail: "Ficheiro não encontrado." });
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/core/")) return await proxyCore(request, response, url);
    const previewMatch = url.pathname.match(/^\/api\/preview\/([^/]+)$/);
    if (previewMatch && request.method === "GET") {
      const id = requireUuid(previewMatch[1]);
      const { files } = await makePreview(id, url.searchParams.get("refresh") === "1");
      return json(response, 200, { pages: files.map((_, index) => `/api/preview-image/${id}/${index + 1}`) });
    }
    const imageMatch = url.pathname.match(/^\/api\/preview-image\/([^/]+)\/(\d+)$/);
    if (imageMatch && request.method === "GET") {
      const id = requireUuid(imageMatch[1]);
      const cached = previewCache.get(id);
      const page = Number(imageMatch[2]);
      if (!cached || page < 1 || page > cached.files.length) return json(response, 404, { detail: "Página não encontrada." });
      const file = join(cached.directory, cached.files[page - 1]);
      const info = await stat(file);
      response.writeHead(200, { "Content-Type": "image/png", "Content-Length": info.size, "Cache-Control": "no-store" });
      return createReadStream(file).pipe(response);
    }
    const downloadMatch = url.pathname.match(/^\/api\/download\/([^/]+)\/(pdf|pptx)$/);
    if (downloadMatch && request.method === "GET") {
      const id = requireUuid(downloadMatch[1]);
      const format = downloadMatch[2];
      const file = await exportDeck(id, format);
      const info = await stat(file);
      response.writeHead(200, {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": info.size,
        "Content-Disposition": `attachment; filename="${basename(file).replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Cache-Control": "no-store",
      });
      return createReadStream(file).pipe(response);
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    if (response.headersSent) return response.destroy();
    json(response, 502, { detail: error instanceof Error ? error.message : "Falha na ligação ao motor de apresentações." });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Dume: http://127.0.0.1:${port}`);
});
