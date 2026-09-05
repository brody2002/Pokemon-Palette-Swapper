# Pokémon Palette Swapper

A dependency-free localhost web app for editing JASC `.pal` files with live previews of indexed PNG sprites.

The public repository contains only the editor. It does not include ROMs, game data, sprites, or palettes.

## Screenshot:
<img width="721" height="565" alt="Screenshot 2026-09-03 at 11 11 17 PM" src="https://github.com/user-attachments/assets/cf029f1e-ccc3-453b-892e-77f1cfb1efc4" />


## Requirements

- Node.js 18 or newer
- A JASC `.pal` file and one or more indexed `.png` sprites

The two files can have different names, live in different directories, and be combined in any way you choose.

## Start the app

Clone this repository, then run:

```sh
npm start
```

Open <http://127.0.0.1:4173>. The first file-pair row is ready automatically:

1. Drag one `.pal` into the Palette slot, or click the slot to choose it.
2. Drag one or more `.png` files into the Sprite slot, or click the slot to choose them.
3. Edit the palette in the editor that opens below the row; every selected PNG updates live.
4. Use **Add row** to create as many additional pairs as needed.

Rows are explicit, so filenames never need to match. When several PNGs use the same palette, select all of them in that palette's row.

Do not open `public/index.html` directly. Browser modules require the localhost server.

## Features

- Independent single-PAL and multi-PNG drop slots in every row
- Unlimited file-pair rows
- Support for unrelated filenames and directories
- Multiple live sprite previews driven by one palette editor
- Live recoloring of indexed PNG previews
- Built-in saturation/brightness spectrum, hue slider, hex input, and direct RGB editing
- Copy and paste colors between any open palette tiles
- Individual Save and Reset controls, plus Save All
- Conflict detection if a writable palette changes on disk after being opened
- Direct save through writable browser handles, with download fallback

## Saving safely

When the browser provides a writable file handle, **Save** writes the edited colors directly to the `.pal` selected for that row. If direct file access is unavailable, the button is labeled **Download** and saves an updated copy instead.

Keep palette files under version control and review resulting diffs before rebuilding your ROM.

The server binds only to `127.0.0.1` and serves the app; it does not scan or depend on a Pokémon project directory.

## Development

```sh
npm test
npm run check
```

Tests use generated data; no Pokémon assets are bundled or downloaded.
