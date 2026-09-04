export function normalizePaletteText(text) {
    return String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
}

export function parseJascPalette(text) {
    const lines = normalizePaletteText(text).split("\n").map(line => line.trim());

    if (lines[0] !== "JASC-PAL")
        throw new Error("Expected a JASC-PAL header.");
    if (!/^\d{4}$/.test(lines[1] ?? ""))
        throw new Error("The palette version must be a four-digit value such as 0100.");

    const count = Number.parseInt(lines[2], 10);
    if (!Number.isInteger(count) || count < 1 || count > 256)
        throw new Error("The palette must declare between 1 and 256 colors.");
    if (lines.length < count + 3)
        throw new Error(`The palette declares ${count} colors but only contains ${lines.length - 3}.`);

    const colors = lines.slice(3, count + 3).map((line, index) => {
        const values = line.split(/\s+/).map(value => Number.parseInt(value, 10));
        if (values.length !== 3 || values.some(value => !Number.isInteger(value) || value < 0 || value > 255))
            throw new Error(`Color ${index} must contain three RGB values from 0 to 255.`);
        return values;
    });

    return { version: lines[1], count, colors };
}

function droppedFile(item) {
    return item?.file ?? item;
}

export function validatePaletteSpritePair(palette, png) {
    const paletteFile = droppedFile(palette);
    const pngFile = droppedFile(png);
    if (!paletteFile?.name?.toLowerCase().endsWith(".pal"))
        throw new Error("The palette slot requires one .pal file.");
    if (!pngFile?.name?.toLowerCase().endsWith(".png"))
        throw new Error("The sprite slot requires one .png file.");
    return { palette, png };
}
