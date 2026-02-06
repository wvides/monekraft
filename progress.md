Original prompt: I want the game to also have a calming music in the brackground. I want the game to also have some animals that are around, a pig a sheep, a chicken.

- DONE: Added calming background music that starts with gameplay and can be toggled/muted.
- DONE: Added ambient animals (pig, sheep, chicken) that appear in-world and roam.
- TODO: Validate visuals/state with Playwright client and inspect screenshot output.

## Update 1
- Added procedural calming background music using WebAudio (starts on first interaction), with `M` key mute toggle.
- Added ambient animals in-world: pig, sheep, and chicken spawn on grass above water and roam around.
- Added deterministic hooks: `window.render_game_to_text()` and `window.advanceTime(ms)`.
- Added `F` fullscreen toggle and HUD readouts for music/animal state.

## Test Notes
- `node --check game.js` passes.
- Playwright validation blocked: `/Users/waltervides/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js` fails with `ERR_MODULE_NOT_FOUND` for `playwright`.
- Attempting `npx playwright --version` hangs in this sandbox (likely install/network restriction), so screenshot-driven verification is pending once Playwright is available.

## TODO Next Agent
- Install/enable `playwright` in this environment, then run the web-game Playwright client against local server and inspect gameplay screenshots for animal visibility and HUD/music state.
- Verify music starts after first click and `M` toggles mute.

## Update 2
- Tuned background music to be calmer: reduced master loudness, softened high frequencies, slower LFO drift, and lower drone base notes.
- Replaced brighter chord stack with a gentler two-voice drone plus a slow lead note pattern (3.4s cycle) using smooth gain envelopes.
- Updated mute behavior to fade in/out (`setTargetAtTime`) instead of abrupt jumps.

## Test Notes (Update 2)
- `node --check game.js` passes after music changes.

## Update 3
- Increased on-screen animal readability by scaling sprite draw size up and expanding culling margins so animals stay visible when near screen edges.
- Reworked pig/sheep/chicken rendering with per-animal details (legs, snouts/beaks, wool/ears/comb, accents, and shadows) while keeping the same canvas style.
- Added an audio bus split (music + SFX) and new gameplay sounds: jump, footsteps, mining hit, and block placement.
- Kept ambient music auto-start on first interaction and `M` toggle, now controlling full game audio output via master gain.

## Test Notes (Update 3)
- `node --check game.js` passes after animal + audio updates.
- Playwright was intentionally not used for this update per explicit user request.

## TODO Next Agent
- Manually run the game in browser and tune SFX/music mix balance if needed on laptop speakers vs headphones.

## Update 4
- Removed animals from gameplay by clearing the spawn list (no pig/sheep/chicken spawn).
- Disabled background music startup/toggle paths and removed music from HUD/debug output.
- Updated HUD controls text to remove `M` music hint.

## Test Notes (Update 4)
- `node --check game.js` passes.

## Update 5
- Reworked terrain stratification so world columns are no longer mostly one dirt profile:
  - Added broad regional rock noise to create grouped stone-heavy areas instead of fully random mixing.
  - Added variable soil depth (thin/thick dirt cap) per region.
  - Added occasional stone outcrops on surface in rocky regions.
  - Increased stone prevalence with depth so lower layers are predominantly stone with fewer dirt pockets.
- Kept deterministic generation using existing noise functions (no runtime randomness in terrain fill).

## Test Notes (Update 5)
- `node --check game.js` passes after terrain generation changes.
- Playwright client still blocked in this environment: `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'` from `/Users/waltervides/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`.

## Update 6
- Increased visible stone terrain patches near surface so stone appears in grouped above-ground areas, not only deep layers.
- Added low-frequency surface rock patch noise plus detail noise to form broader rocky zones with natural edges.
- Extended rocky-zone influence to shallow subsurface (`depth <= 2`) so rocky areas feel connected instead of single exposed blocks.

## Test Notes (Update 6)
- `node --check game.js` passes after surface-rock distribution update.
- Playwright client remains blocked in this environment: missing `playwright` package for the skill client script.

## Update 7
- Added mountain-heavy terrain shaping in `terrainHeight()` to produce taller ridge/peak regions while preserving lowlands and water basins.
- Added a random weather cycle (`sunny`, `rain`, `snow`) with per-state durations and smooth intensity transitions.
- Added weather rendering: sky/fog tint shifts plus precipitation particles for rain/snow.
- Added snow accumulation on exposed top surfaces during snow; snow cover is cleared when snow weather ends.
- Updated mining/placement to refresh per-column surface cache so snow overlays stay accurate after terrain edits.
- Exposed weather + snow coverage in HUD debug text and `window.render_game_to_text()`.

## Test Notes (Update 7)
- `node --check game.js` passes.
- Ran skill client command:
  - `node "$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:8000 --actions-file "$HOME/.codex/skills/develop-web-game/references/action_payloads.json" --iterations 2 --pause-ms 200`
- Playwright run is blocked in this environment with `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`.

## TODO Next Agent
- Install/enable `playwright` in this environment, rerun the skill client, open generated screenshots, and verify weather transitions + snow top-layer visuals in gameplay.

## Update 8
- Reduced weather frequency so events feel occasional instead of constant.
- Increased sunny duration window significantly.
- Adjusted transition weights to strongly prefer sunny after rain/snow and reduce long precipitation streaks.

## Test Notes (Update 8)
- `node --check game.js` passes.
- Playwright skill client rerun still blocked by missing `playwright` package (`ERR_MODULE_NOT_FOUND`).

## Update 9
- Strengthened terrain biome generation so above-ground stone appears in grouped rocky zones:
  - Added low-frequency biome bands (`rockyBiome`) to create large rocky areas.
  - Added mid-frequency patching (`rockyPatch`) so stone surfaces cluster naturally within those zones.
  - Added highland stone behavior so higher terrain tends to expose stone faces.
  - Reduced soil depth in rocky biomes and expanded shallow-stone patches (`depth <= 3`) to connect surface rock with near-surface strata.
- Added per-run `WORLD_SEED` into terrain noise hashing so each page load creates a different procedural world layout.
- Exposed seed in debug text and `render_game_to_text()` output for reproducibility checks.

## Test Notes (Update 9)
- `node --check game.js` passes after biome + seed changes.
- Playwright skill client remains blocked in this environment: `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`.

## Update 10
- Added explicit world seed controls on the start overlay (`World seed` input + `Apply` + `Random`).
- World generation now resolves seed text from `?seed=...`, then localStorage fallback, then a random default.
- Added deterministic seed normalization:
  - Numeric seeds use their unsigned 32-bit value.
  - Non-numeric seeds hash to a stable 32-bit seed.
- Persisted selected seed to URL + localStorage so reloading preserves/re-shares worlds.
- Updated debug and `window.render_game_to_text()` to expose both `world_seed_text` and numeric `world_seed`.

## Test Notes (Update 10)
- `node --check game.js` passes.
- Ran Playwright skill client command:
  - `node "$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:8000 --actions-file "$HOME/.codex/skills/develop-web-game/references/action_payloads.json" --iterations 1 --pause-ms 200`
- Playwright run remains blocked in this environment with `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`.

## TODO Next Agent
- Install/enable `playwright`, run the skill client against a running local server, and confirm screenshots/text state show stable terrain for repeated runs of the same `seed` and changed terrain for different seeds.

## Update 11
- Fixed void-fall loop after mining the lowest layer:
  - Prevented mining bottom-layer blocks (`y <= 0`) in `mineTargetBlock()`.
  - Replaced void recovery teleport (`WORLD_Y - 1`) with safe-ground respawn logic.
  - Added `findSafeRespawn(preferredX, preferredZ)` to locate the nearest non-colliding surface spawn.
  - Added `respawnPlayer(preferredX, preferredZ)` to reset position/velocity safely after falling below world.

## Test Notes (Update 11)
- `node --check game.js` passes.
- Ran Playwright skill client command:
  - `node "$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:8000 --actions-file "$HOME/.codex/skills/develop-web-game/references/action_payloads.json" --iterations 1 --pause-ms 200`
- Playwright validation remains blocked in this environment: `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`.

## Update 12
- Added clearer block separation lines in the voxel renderer by drawing subtle face-edge outlines directly in the raycast shading pass.
- Extended `castRay()` to return face UV coordinates (`u`, `v`) and accurate hit distance for the entered face.
- Applied stronger edge contrast on bottom faces so vertical stack separation remains visible while mining downward.

## Test Notes (Update 12)
- `node --check game.js` passes.
- Ran Playwright skill client command:
  - `node "$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:8000 --actions-file "$HOME/.codex/skills/develop-web-game/references/action_payloads.json" --iterations 1 --pause-ms 200`
- Playwright validation remains blocked in this environment: `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`.

## TODO Next Agent
- Install/enable `playwright` and run the skill client to capture gameplay screenshots, then verify block-edge visibility while mining bottom-facing/near-bottom surfaces.

## Update 13
- Removed the recently added block face outline/border shading from the voxel render pass.
- Reverted `castRay()` UV/edge helper additions that were only used for block border rendering.

## Test Notes (Update 13)
- `node --check game.js` passes.

## Update 14
- Redesigned the controls HUD into a structured, easier-to-scan card with grouped rows (`Move`, `Build`, `UI`, `System`) and keycap-style labels.
- Added `P` to controls and implemented debug panel toggling with `KeyP`.
- Debug panel now starts hidden by default and only appears when debug mode is toggled on.
- Added responsive adjustments for the controls card on smaller screens.

## Test Notes (Update 14)
- `node --check game.js` passes.
- Ran Playwright skill client command:
  - `node "$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:8000 --actions-file "$HOME/.codex/skills/develop-web-game/references/action_payloads.json" --iterations 1 --pause-ms 200`
- Playwright run is currently blocked by missing browser binary (`chrome-headless-shell`); suggested setup command is `npx playwright install`.

## Update 15
- Adjusted controls card to feel more vertical:
  - Reduced controls panel width.
  - Stacked each control section label above its key/value chips.
  - Slightly tightened vertical spacing for clearer column flow.

## Update 16
- Reduced controls HUD footprint to remove wasted right-side space:
  - Narrowed panel width.
  - Reduced panel padding and row gaps.
  - Reduced key chip and label sizing for denser layout.
  - Tightened mobile spacing further.

## Update 17
- Made the controls HUD outer box shrink to content width (`width: max-content`) with a tighter `max-width` cap.
- This removes persistent empty right-side space and forces a more vertical card when needed.

## Update 18
- Updated seed apply behavior so `Apply` (and Enter in seed input) now starts gameplay immediately when the seed is unchanged.
- Removed same-seed forced reload from apply flow.
- Added best-effort autostart flag across seed-change reloads so apply can attempt to start gameplay after navigation.
- Reused a single `startGameplay()` helper for both overlay click and apply-triggered start.

## Test Notes (Update 18)
- `node --check game.js` passes.
