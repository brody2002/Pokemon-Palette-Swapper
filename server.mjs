import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import {
    collectFiles,
    findAffectedSprites,
    normalizePaletteText,
    parseJascPalette,
    readPngDimensions,
} from "./palette.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(moduleDirectory, "public");
const MAX_BODY_SIZE = 2 * 1024 * 1024;

const MIME_TYPES = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
]);

function isWithin(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeRepoPath(repoRoot, paletteRoot, relativePath, extension) {
    if (typeof relativePath !== "string")
        throw new Error("A repository-relative path is required.");
    const absolutePath = path.resolve(repoRoot, relativePath);
    if (!isWithin(paletteRoot, absolutePath) || (extension && path.extname(absolutePath).toLowerCase() !== extension))
        throw new Error("The requested path is outside graphics/pokemon.");
    return absolutePath;
}

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_SIZE)
            throw new Error("Request body is too large.");
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function contentHash(text) {
    return crypto.createHash("sha256").update(normalizePaletteText(text)).digest("hex");
}

async function buildPaletteIndex(repoRoot, paletteRoot) {
    const files = await collectFiles(paletteRoot, ".pal");
    const entries = [];
    for (const absolutePath of files) {
        const content = await readFile(absolutePath, "utf8");
        entries.push({
            absolutePath,
            relativePath: path.relative(repoRoot, absolutePath),
            filename: path.basename(absolutePath).toLowerCase(),
            hash: contentHash(content),
        });
    }
    return entries;
}

function resolvePathHint(pathHint, repoRoot, paletteRoot) {
    if (!pathHint || typeof pathHint !== "string")
        return null;

    let absolutePath;
    if (path.isAbsolute(pathHint)) {
        absolutePath = path.resolve(pathHint);
    } else {
        const normalized = pathHint.replaceAll("\\", "/");
        const marker = "graphics/pokemon/";
        const markerIndex = normalized.indexOf(marker);
        if (markerIndex === -1)
            return null;
        absolutePath = path.resolve(repoRoot, normalized.slice(markerIndex));
    }

    return isWithin(paletteRoot, absolutePath) && path.extname(absolutePath).toLowerCase() === ".pal" ? absolutePath : null;
}

async function describeMatch(entry, droppedContent, repoRoot) {
    const diskContent = await readFile(entry.absolutePath, "utf8");
    const droppedPalette = parseJascPalette(droppedContent);
    const diskPalette = parseJascPalette(diskContent);
    const target = await findAffectedSprites(entry.absolutePath, repoRoot);

    for (const asset of target.assets) {
        const buffer = await readFile(path.join(repoRoot, asset.path));
        Object.assign(asset, readPngDimensions(buffer));
    }

    return {
        path: entry.relativePath,
        species: path.basename(path.dirname(entry.absolutePath)),
        paletteName: path.basename(entry.absolutePath),
        version: droppedPalette.version,
        colors: droppedPalette.colors,
        diskColors: diskPalette.colors,
        expectedContent: diskContent,
        target: target.kind,
        assets: target.assets,
    };
}

async function resolvePaletteFiles(request, response, context) {
    const body = await readJson(request);
    if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 50)
        return sendJson(response, 400, { error: "Choose between 1 and 50 palette files." });

    const results = [];
    for (const file of body.files) {
        try {
            if (typeof file.name !== "string" || !file.name.toLowerCase().endsWith(".pal"))
                throw new Error("Only .pal files are supported.");
            parseJascPalette(file.content);

            const hintedPath = resolvePathHint(file.pathHint, context.repoRoot, context.paletteRoot);
            let candidates = [];
            if (hintedPath) {
                const hintedEntry = context.paletteIndex.find(entry => entry.absolutePath === hintedPath);
                if (hintedEntry)
                    candidates = [hintedEntry];
            }

            if (candidates.length === 0) {
                const hash = contentHash(file.content);
                candidates = context.paletteIndex.filter(entry => entry.filename === file.name.toLowerCase() && entry.hash === hash);
            }

            const matches = [];
            for (const entry of candidates.slice(0, 50))
                matches.push(await describeMatch(entry, file.content, context.repoRoot));

            results.push({
                clientId: file.clientId,
                name: file.name,
                matches,
                error: matches.length === 0 ? "No exact repository match was found. Drag the unmodified .pal file from graphics/pokemon." : null,
            });
        } catch (error) {
            results.push({ clientId: file.clientId, name: file.name, matches: [], error: error.message });
        }
    }

    sendJson(response, 200, { results });
}

async function savePalettes(request, response, context) {
    const body = await readJson(request);
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 50)
        return sendJson(response, 400, { error: "Choose between 1 and 50 palettes to save." });

    const validated = [];
    for (const entry of body.entries) {
        const absolutePath = safeRepoPath(context.repoRoot, context.paletteRoot, entry.path, ".pal");
        parseJascPalette(entry.content);
        const diskContent = await readFile(absolutePath, "utf8");
        if (diskContent !== entry.expectedContent)
            return sendJson(response, 409, { error: `${entry.path} changed on disk. Drop it again before overwriting it.` });
        validated.push({ ...entry, absolutePath });
    }

    const saved = [];
    for (const entry of validated) {
        const temporaryPath = `${entry.absolutePath}.palette-editor-${process.pid}-${crypto.randomUUID()}`;
        try {
            await writeFile(temporaryPath, entry.content, "utf8");
            await rename(temporaryPath, entry.absolutePath);
        } finally {
            await unlink(temporaryPath).catch(() => {});
        }
        const indexedEntry = context.paletteIndex.find(candidate => candidate.absolutePath === entry.absolutePath);
        if (indexedEntry)
            indexedEntry.hash = contentHash(entry.content);
        saved.push({ path: entry.path, content: entry.content });
    }

    sendJson(response, 200, { saved });
}

async function serveAsset(requestUrl, response, context) {
    const relativePath = requestUrl.searchParams.get("path");
    const absolutePath = safeRepoPath(context.repoRoot, context.paletteRoot, relativePath, ".png");
    const body = await readFile(absolutePath);
    response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    response.end(body);
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

export function resolveProjectRoot(args = process.argv.slice(2), environment = process.env, workingDirectory = process.cwd()) {
    let configuredPath = environment.POKEMON_PROJECT_ROOT;
    const flagIndex = args.indexOf("--project");
    if (flagIndex !== -1) {
        if (!args[flagIndex + 1])
            throw new Error("--project requires a directory path.");
        configuredPath = args[flagIndex + 1];
    }
    const inlineFlag = args.find(argument => argument.startsWith("--project="));
    if (inlineFlag)
        configuredPath = inlineFlag.slice("--project=".length);

    return path.resolve(workingDirectory, configuredPath || workingDirectory);
}

export async function createPaletteEditorServer(options = {}) {
    const repoRoot = path.resolve(options.projectRoot ?? resolveProjectRoot());
    const paletteRoot = path.join(repoRoot, "graphics/pokemon");
    try {
        const info = await stat(paletteRoot);
        if (!info.isDirectory())
            throw new Error("not a directory");
    } catch {
        throw new Error(`No graphics/pokemon directory was found under ${repoRoot}. Start with --project /path/to/pokemon-project.`);
    }

    const context = {
        repoRoot,
        paletteRoot,
        paletteIndex: await buildPaletteIndex(repoRoot, paletteRoot),
    };
    const server = http.createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, "http://127.0.0.1");
            if (request.method === "GET" && requestUrl.pathname === "/api/health")
                return sendJson(response, 200, { ok: true, palettes: context.paletteIndex.length, project: path.basename(context.repoRoot) });
            if (request.method === "POST" && requestUrl.pathname === "/api/resolve-palettes")
                return await resolvePaletteFiles(request, response, context);
            if (request.method === "POST" && requestUrl.pathname === "/api/save-palettes")
                return await savePalettes(request, response, context);
            if (request.method === "GET" && requestUrl.pathname === "/api/asset")
                return await serveAsset(requestUrl, response, context);
            if (request.method === "GET")
                return await serveStatic(decodeURIComponent(requestUrl.pathname), response);
            sendJson(response, 405, { error: "Method not allowed." });
        } catch (error) {
            const statusCode = error.code === "ENOENT" ? 404 : 400;
            sendJson(response, statusCode, { error: error.message });
        }
    });
    server.paletteEditor = context;
    return server;
}

export async function startPaletteEditor(options = {}) {
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? Number.parseInt(process.env.PALETTE_EDITOR_PORT ?? "4173", 10);
    const server = await createPaletteEditorServer(options);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
    });
    const address = server.address();
    console.log(`Pokémon Palette Swapper: http://${host}:${address.port}`);
    console.log(`Project: ${server.paletteEditor.repoRoot}`);
    console.log(`Indexed ${server.paletteEditor.paletteIndex.length} .pal files.`);
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        console.log("Usage: npm start -- --project /path/to/pokemon-project");
        console.log("Environment: POKEMON_PROJECT_ROOT and PALETTE_EDITOR_PORT are also supported.");
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
