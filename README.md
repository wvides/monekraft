# monekraft

A lightweight voxel sandbox browser prototype built with plain JavaScript and HTML5 canvas.

`monekraft` focuses on fast iteration and simple gameplay mechanics: procedural terrain, first-person movement, block mining/placing, and a usable toolbar + inventory loop.

## Features

- Procedurally generated voxel terrain (grass, dirt, stone, water)
- Tree generation with wood and leaf blocks
- First-person controls with pointer lock mouse look
- Physics basics: gravity, jumping, collision, world bounds
- Block mining with pickup into inventory
- Block placement with collision-safe checks
- 8-slot toolbar (blocks + tools)
- Inventory panel for assigning collected blocks to toolbar slots
- Pixel-style software rendering pipeline on canvas (ray-cast style)

## Tech Stack

- `HTML5`
- `CSS3`
- `Vanilla JavaScript` (single-file game logic, no framework)
- `Canvas 2D API`

## Project Structure

```text
monekraft/
├── index.html   # Game shell + HUD
├── style.css    # UI/HUD styling
├── game.js      # World generation, rendering, input, gameplay logic
└── README.md
```

## Getting Started

No build step or dependencies required.

1. Clone/download the project.
2. Start a local static server from the project root.
3. Open the served `index.html` in your browser.

Example server options:

```bash
# Python 3
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000`

## Local Testing

Use any static server and verify the game loads from the served URL.

```bash
# Python 3
python3 -m http.server 8000
```

Then visit `http://localhost:8000` and test controls/input in browser.

## GitHub Pages Deployment

This repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that deploys the site to GitHub Pages on every push to `main`.

After you push to GitHub, do this once:

1. Open repository `Settings`.
2. Go to `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.

After that, each push to `main` publishes the current static files (`index.html`, `style.css`, `game.js`) to your Pages URL.

## Controls

- `Click` canvas: capture mouse / start playing
- `Esc`: release mouse (or close inventory if open)
- `W A S D`: move
- `Mouse`: look around
- `Space`: jump
- `Left Click`: mine/break blocks (hold to continuously mine)
- `Right Click`: place selected block
- `1-8` (top row or numpad): select toolbar slot
- `E`: open/close inventory

## Gameplay Notes

- Slot `7` is the pickaxe tool.
- Slot `8` is hand/tool fallback.
- Breaking solid blocks adds them to your inventory.
- You can assign collected block types to block slots from the inventory UI.
- Placement consumes one block from the selected slot count.

## Roadmap Ideas

- Save/load world state
- Chunked world generation for larger maps
- Better lighting and ambient occlusion
- Crafting + item recipes
- Mobile/touch controls
- Sound effects and ambient audio

## License

No license file is currently included. Add one if you plan to distribute or open-source this project publicly.
