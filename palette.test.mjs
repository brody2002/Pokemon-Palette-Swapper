import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
    findAffectedSprites,
    parseJascPalette,
    readPngDimensions,
    serializeJascPalette,
} from "./palette.mjs";
import { createPaletteEditorServer, resolveProjectRoot } from "./server.mjs";

const PALETTE = [
    "JASC-PAL",
    "0100",
    "4",
    "0 0 0",
    "255 255 255",
    "224 56 64",
    "128 40 48",
    "",
].join("\r\n");

function pngHeader(width = 32, height = 64) {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
}

async function withFixture(callback) {
    const root = await mkdtemp(path.join(os.tmpdir(), "pokemon-palette-swapper-"));
    try {
        await callback(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function writeSpecies(root, species, files) {
    const directory = path.join(root, "graphics/pokemon", species);
    await mkdir(directory, { recursive: true });
    await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(directory, name), content)));
    return directory;
}

test("JASC palettes round-trip with all RGB entries intact", () => {
    const parsed = parseJascPalette(PALETTE);

    assert.equal(parsed.version, "0100");
    assert.equal(parsed.count, 4);
    assert.deepEqual(parseJascPalette(serializeJascPalette(parsed)), parsed);
});

test("JASC parser rejects missing and out-of-range colors", () => {
    assert.throws(
        () => parseJascPalette("JASC-PAL\n0100\n2\n0 0 0\n"),
        /declares 2 colors/,
    );
    assert.throws(
        () => parseJascPalette("JASC-PAL\n0100\n1\n256 0 0\n"),
        /Color 0/,
    );
});

test("palette naming conventions map to icon, overworld, and battle sprites", async () => {
    await withFixture(async root => {
        const directory = await writeSpecies(root, "infernape", {
            "icon.png": pngHeader(),
            "icon_shiny.pal": PALETTE,
            "overworld.png": pngHeader(192, 32),
            "overworld_shiny.pal": PALETTE,
            "anim_front.png": pngHeader(64, 128),
            "back.png": pngHeader(64, 64),
            "shiny.pal": PALETTE,
        });

        const icon = await findAffectedSprites(path.join(directory, "icon_shiny.pal"), root);
        const overworld = await findAffectedSprites(path.join(directory, "overworld_shiny.pal"), root);
        const battle = await findAffectedSprites(path.join(directory, "shiny.pal"), root);

        assert.deepEqual(icon.assets.map(asset => path.basename(asset.path)), ["icon.png"]);
        assert.deepEqual(overworld.assets.map(asset => path.basename(asset.path)), ["overworld.png"]);
        assert.deepEqual(battle.assets.map(asset => path.basename(asset.path)), ["anim_front.png", "back.png"]);
    });
});

test("GBA and special palettes map to alternate sprite files", async () => {
    await withFixture(async root => {
        const gbaDirectory = await writeSpecies(root, "bulbasaur", {
            "anim_front_gba.png": pngHeader(64, 128),
            "back_gba.png": pngHeader(64, 64),
            "normal_gba.pal": PALETTE,
        });
        const eggDirectory = await writeSpecies(root, "egg", {
            "hatch.png": pngHeader(),
            "hatch_shiny.pal": PALETTE,
        });

        const gba = await findAffectedSprites(path.join(gbaDirectory, "normal_gba.pal"), root);
        const hatch = await findAffectedSprites(path.join(eggDirectory, "hatch_shiny.pal"), root);

        assert.deepEqual(gba.assets.map(asset => path.basename(asset.path)), ["anim_front_gba.png", "back_gba.png"]);
        assert.deepEqual(hatch.assets.map(asset => path.basename(asset.path)), ["hatch.png"]);
    });
});

test("sprite dimensions are read from the PNG header", () => {
    assert.deepEqual(readPngDimensions(pngHeader(32, 64)), { width: 32, height: 64 });
});

test("project path supports a flag, environment variable, and working-directory default", () => {
    assert.equal(resolveProjectRoot(["--project", "../game"], {}, "/work/tool"), "/work/game");
    assert.equal(resolveProjectRoot([], { POKEMON_PROJECT_ROOT: "/games/pokemon" }, "/work/tool"), "/games/pokemon");
    assert.equal(resolveProjectRoot([], {}, "/games/pokemon"), "/games/pokemon");
});

test("server resolves and saves palettes inside the selected project", async () => {
    await withFixture(async root => {
        const directory = await writeSpecies(root, "infernape", {
            "icon.png": pngHeader(),
            "icon_shiny.pal": PALETTE,
        });
        const server = await createPaletteEditorServer({ projectRoot: root });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
            const resolvedResponse = await fetch(`${baseUrl}/api/resolve-palettes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ files: [{ clientId: "one", name: "icon_shiny.pal", content: PALETTE }] }),
            });
            const resolved = await resolvedResponse.json();
            assert.equal(resolved.results[0].matches[0].path, "graphics/pokemon/infernape/icon_shiny.pal");
            assert.equal(resolved.results[0].matches[0].assets[0].width, 32);

            const changed = PALETTE.replace("224 56 64", "120 56 64");
            const saveResponse = await fetch(`${baseUrl}/api/save-palettes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entries: [{
                    path: "graphics/pokemon/infernape/icon_shiny.pal",
                    content: changed,
                    expectedContent: PALETTE,
                }] }),
            });
            assert.equal(saveResponse.status, 200);
            assert.equal(await readFile(path.join(directory, "icon_shiny.pal"), "utf8"), changed);

            const traversalResponse = await fetch(`${baseUrl}/api/asset?path=${encodeURIComponent("../secret.png")}`);
            assert.equal(traversalResponse.status, 400);
        } finally {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    });
});
