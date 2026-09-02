# Pokémon Palette Swapper

A dependency-free localhost web app for editing JASC `.pal` files with live previews of the indexed Pokémon sprites they affect.

The public repository contains only the editor. It does not include ROMs, game data, sprites, or palettes.

## Requirements

- Node.js 18 or newer
- A compatible Pokémon project with JASC palettes and indexed PNG sprites under `graphics/pokemon`

## Start the app

Clone this repository, then run:

```sh
npm start -- --project /absolute/path/to/your/pokemon-project
```

Open <http://127.0.0.1:4173> and drag one or more `.pal` files from the selected project's `graphics/pokemon` directory onto the page.

You can also provide the project with an environment variable:

```sh
POKEMON_PROJECT_ROOT=/absolute/path/to/your/pokemon-project npm start
```

When running `server.mjs` directly from a compatible Pokémon project root, the current directory is used automatically.

Do not open `public/index.html` directly. Palette discovery, sprite loading, and saving require the localhost server.

## Features

- Drag-and-drop and multi-file browsing
- Automatic icon, overworld, front, and back sprite discovery
- Live recoloring of indexed PNG previews
- Color picker and direct RGB editing
- Individual Save, Reset, Close, and Save All controls
- Female, GBA-style, egg, and same-folder battle variants
- Exact-content matching when a browser hides a dragged file's full path
- Conflict detection if a palette changes on disk after being opened
- Server-side path validation restricted to `graphics/pokemon`

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

Save writes directly to the selected project's `.pal` files. Keep the project under version control and review the resulting diff before rebuilding your ROM.

The server binds only to `127.0.0.1`. It rejects files outside the selected project's `graphics/pokemon` directory and refuses to overwrite a palette that another program changed after it was opened.

## Development

```sh
npm test
npm run check
```

Tests use generated temporary fixtures; no Pokémon assets are bundled or downloaded.
