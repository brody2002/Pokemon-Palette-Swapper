export { normalizePaletteText, parseJascPalette } from "./public/palette-files.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function serializeJascPalette(palette) {
    const colors = palette.colors ?? [];
    if (colors.length < 1 || colors.length > 256)
        throw new Error("A palette must contain between 1 and 256 colors.");

    for (const [index, color] of colors.entries()) {
        if (!Array.isArray(color) || color.length !== 3 || color.some(value => !Number.isInteger(value) || value < 0 || value > 255))
            throw new Error(`Color ${index} must contain three RGB values from 0 to 255.`);
    }

    return [
        "JASC-PAL",
        palette.version ?? "0100",
        String(colors.length),
        ...colors.map(color => color.join(" ")),
        "",
    ].join("\r\n");
}

export function readPngDimensions(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
        throw new Error("Not a valid PNG file.");
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
