import assert from "node:assert/strict";
import test from "node:test";
import {
    parseJascPalette,
    readPngDimensions,
    serializeJascPalette,
} from "./palette.mjs";
import { hsvToRgb, rgbToHsv } from "./public/color-utils.mjs";
import { validatePaletteSpritePair } from "./public/palette-files.mjs";
import { createPaletteEditorServer } from "./server.mjs";

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

test("a row accepts unrelated palette and PNG filenames from any path", () => {
    const palette = { file: { name: "shared_colors.PAL", path: "/one/shared_colors.PAL" }, handle: {} };
    const png = { file: { name: "front_frame.PNG", path: "/elsewhere/front_frame.PNG" }, handle: {} };

    assert.deepEqual(validatePaletteSpritePair(palette, png), { palette, png });
});

test("the same palette can be reused with multiple PNG rows", () => {
    const palette = { name: "shared.pal" };
    const first = validatePaletteSpritePair(palette, { name: "icon.png" });
    const second = validatePaletteSpritePair(palette, { name: "overworld.png" });

    assert.equal(first.palette, second.palette);
    assert.notEqual(first.png, second.png);
});

test("row slots reject swapped or unsupported file types", () => {
    assert.throws(
        () => validatePaletteSpritePair({ name: "sprite.png" }, { name: "palette.pal" }),
        /palette slot requires one \.pal/,
    );
    assert.throws(
        () => validatePaletteSpritePair({ name: "palette.pal" }, { name: "notes.txt" }),
        /sprite slot requires one \.png/,
    );
});

test("custom color picker conversions preserve RGB colors", () => {
    const colors = [
        [0, 0, 0],
        [255, 255, 255],
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [37, 142, 219],
    ];

    for (const color of colors)
        assert.deepEqual(hsvToRgb(rgbToHsv(color)), color);
});

test("sprite dimensions are read from the PNG header", () => {
    assert.deepEqual(readPngDimensions(pngHeader(32, 64)), { width: 32, height: 64 });
});

test("server exposes the standalone row-based app without repository APIs", async () => {
    const server = createPaletteEditorServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        const health = await (await fetch(`${baseUrl}/api/health`)).json();
        assert.deepEqual(health, { ok: true });
        const index = await (await fetch(baseUrl)).text();
        assert.match(index, /id="pair-list"/);
        const moduleResponse = await fetch(`${baseUrl}/palette-files.mjs`);
        assert.match(moduleResponse.headers.get("content-type"), /^text\/javascript/);
        const removedApi = await fetch(`${baseUrl}/api/resolve-palettes`, { method: "POST" });
        assert.equal(removedApi.status, 405);
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
