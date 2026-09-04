import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(moduleDirectory, "public");

const MIME_TYPES = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
]);

function isWithin(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
}

async function serveStatic(pathname, response) {
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const absolutePath = path.resolve(publicRoot, requested);
    if (!isWithin(publicRoot, absolutePath) && absolutePath !== path.join(publicRoot, "index.html"))
        throw new Error("Invalid static path.");
    const info = await stat(absolutePath);
    if (!info.isFile())
        throw new Error("Static path is not a file.");
    const body = await readFile(absolutePath);
    response.writeHead(200, {
        "Content-Type": MIME_TYPES.get(path.extname(absolutePath)) ?? "application/octet-stream",
        "Cache-Control": "no-store",
    });
    response.end(body);
}

export function createPaletteEditorServer() {
    return http.createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, "http://127.0.0.1");
            if (request.method === "GET" && requestUrl.pathname === "/api/health")
                return sendJson(response, 200, { ok: true });
            if (request.method === "GET")
                return await serveStatic(decodeURIComponent(requestUrl.pathname), response);
            sendJson(response, 405, { error: "Method not allowed." });
        } catch (error) {
            const statusCode = error.code === "ENOENT" ? 404 : 400;
            sendJson(response, statusCode, { error: error.message });
        }
    });
}

export async function startPaletteEditor(options = {}) {
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? Number.parseInt(process.env.PALETTE_EDITOR_PORT ?? "4173", 10);
    const server = createPaletteEditorServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
    });
    const address = server.address();
    console.log(`Pokémon Palette Swapper: http://${host}:${address.port}`);
    console.log("Ready for explicit .pal and .png file pairs.");
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        console.log("Usage: npm start");
        console.log("Environment: PALETTE_EDITOR_PORT can override the default port.");
    } else {
        try {
            await startPaletteEditor();
        } catch (error) {
            const message = error.code === "EADDRINUSE"
                ? `Port ${process.env.PALETTE_EDITOR_PORT ?? "4173"} is already in use.`
                : error.message;
            console.error(`Could not start Pokémon Palette Swapper: ${message}`);
            process.exitCode = 1;
        }
    }
}
