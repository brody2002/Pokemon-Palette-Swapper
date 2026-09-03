# Pokémon Palette Swapper

A dependency-free localhost web app for editing JASC `.pal` files with live previews of matching indexed PNG sprites.

The public repository contains only the editor. It does not include ROMs, game data, sprites, or palettes.

## Requirements

- Node.js 18 or newer
- Matching JASC `.pal` and indexed `.png` files

## Start the app

Clone this repository, then run:

```sh
npm start
```

Open <http://127.0.0.1:4173> and drag a `.pal` file together with a `.png` that has the same basename—for example, `lugia.pal` and `lugia.png`. The files can be stored anywhere, and multiple pairs can be opened together.

Optionally select a compatible Pokémon project to retain automatic sprite discovery for palette-only drops:

```sh
npm start -- --project /absolute/path/to/your/pokemon-project
```

When running `server.mjs` directly from a compatible Pokémon project root, the current directory is used automatically.

Do not open `public/index.html` directly. Browser modules and repository fallback features require the localhost server.

## Features

- Drag-and-drop and multi-file browsing
- Same-name `.pal`/`.png` pairing from any folder
- Automatic icon, overworld, front, and back sprite discovery
- Live recoloring of indexed PNG previews
- Built-in saturation/brightness spectrum, hue slider, hex input, and direct RGB editing
- Copy and paste colors between any open palette tiles
- Individual Save, Reset, Close, and Save All controls
- Female, GBA-style, egg, and same-folder battle variants
- Exact-content matching when a browser hides a dragged file's full path
- Conflict detection if a palette changes on disk after being opened
- Direct save through writable browser handles, with download fallback
- Server-side path validation for optional project access

## Palette conventions

The automatic resolver recognizes these common patterns:

| Palette | Previewed sprites |
| --- | --- |
| `normal.pal`, `shiny.pal` | `anim_front.png` or `front.png`, plus `back.png` |
| `normalf.pal`, `shinyf.pal` | Female front/back sprites, with normal fallbacks |
| `normal_gba.pal`, `shiny_gba.pal` | GBA-style front/back sprites |
| `icon_normal.pal`, `icon_shiny.pal` | `icon.png` |
| `iconf_normal.pal`, `iconf_shiny.pal` | `iconf.png`, with `icon.png` fallback |
| `overworld_normal.pal`, `overworld_shiny.pal` | `overworld.png` |
| Female overworld variants | `overworldf.png`, with `overworld.png` fallback |
| Special palettes such as `hatch_shiny.pal` | Same-name PNG or same-folder front/back sprites |

Some shared palettes, such as global icon palette banks, do not correspond to one specific PNG and therefore display without a sprite preview.

## Saving safely

When the browser provides a writable file handle, Save writes directly to a dropped `.pal`; otherwise the editor downloads an updated copy. Keep project files under version control and review resulting diffs before rebuilding your ROM.

The server binds only to `127.0.0.1`. Optional repository lookup remains restricted to the selected project's `graphics/pokemon` directory and refuses to overwrite a palette that another program changed after it was opened.

## Development

```sh
npm test
npm run check
```

Tests use generated temporary fixtures; no Pokémon assets are bundled or downloaded.
