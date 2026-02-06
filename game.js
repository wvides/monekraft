(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const debugEl = document.getElementById("debug");
  const overlay = document.getElementById("overlay");
  const toolbarEl = document.getElementById("toolbar");
  const inventoryPanelEl = document.getElementById("inventoryPanel");
  const inventoryGridEl = document.getElementById("inventoryGrid");

  const RENDER_W = 240;
  const RENDER_H = 135;
  canvas.width = RENDER_W;
  canvas.height = RENDER_H;

  const image = ctx.createImageData(RENDER_W, RENDER_H);
  const pixels = image.data;

  const WORLD_X = 64;
  const WORLD_Y = 32;
  const WORLD_Z = 64;
  const COLUMN_COUNT = WORLD_X * WORLD_Z;

  const BLOCK_AIR = 0;
  const BLOCK_GRASS = 1;
  const BLOCK_DIRT = 2;
  const BLOCK_STONE = 3;
  const BLOCK_WATER = 4;
  const BLOCK_WOOD = 5;
  const BLOCK_LEAVES = 6;

  const WATER_LEVEL = 11;
  const WORLD_SEED = Math.floor(Math.random() * 2147483647);

  const world = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
  const columnTopSolidY = new Int16Array(COLUMN_COUNT);
  const snowCoverByColumn = new Float32Array(COLUMN_COUNT);
  columnTopSolidY.fill(-1);

  const WEATHER_SUNNY = "sunny";
  const WEATHER_RAIN = "rain";
  const WEATHER_SNOW = "snow";

  function idx(x, y, z) {
    return x + WORLD_X * (z + WORLD_Z * y);
  }

  function inBounds(x, y, z) {
    return x >= 0 && x < WORLD_X && y >= 0 && y < WORLD_Y && z >= 0 && z < WORLD_Z;
  }

  function getBlock(x, y, z) {
    if (!inBounds(x, y, z)) return BLOCK_AIR;
    return world[idx(x, y, z)];
  }

  function setBlock(x, y, z, type) {
    if (!inBounds(x, y, z)) return;
    world[idx(x, y, z)] = type;
  }

  function hash2(x, z) {
    const seedX = WORLD_SEED * 0.00137;
    const seedZ = WORLD_SEED * 0.00191;
    const n = Math.sin((x + seedX) * 127.1 + (z - seedZ) * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function noise2(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const sx = x - x0;
    const sz = z - z0;

    const n00 = hash2(x0, z0);
    const n10 = hash2(x1, z0);
    const n01 = hash2(x0, z1);
    const n11 = hash2(x1, z1);

    const ux = sx * sx * (3 - 2 * sx);
    const uz = sz * sz * (3 - 2 * sz);

    const nx0 = n00 * (1 - ux) + n10 * ux;
    const nx1 = n01 * (1 - ux) + n11 * ux;
    return nx0 * (1 - uz) + nx1 * uz;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function terrainHeight(x, z) {
    const h1 = noise2(x * 0.08, z * 0.08);
    const h2 = noise2(x * 0.03 + 100, z * 0.03 + 100);
    const mountainField = Math.max(0, noise2(x * 0.018 + 350, z * 0.018 + 350) - 0.5) * 2.2;
    const ridge = 1 - Math.abs(noise2(x * 0.062 + 610, z * 0.062 + 610) * 2 - 1);
    const mountainBoost = mountainField * (4 + ridge * 10);
    return Math.floor(6 + h1 * 6 + h2 * 5 + mountainBoost);
  }

  function canPlaceTree(x, y, z, trunkHeight) {
    if (x < 2 || x > WORLD_X - 3 || z < 2 || z > WORLD_Z - 3) return false;
    if (y < 1 || y + trunkHeight + 2 >= WORLD_Y) return false;
    if (getBlock(x, y - 1, z) !== BLOCK_GRASS) return false;

    for (let ty = y; ty <= y + trunkHeight + 2; ty++) {
      if (getBlock(x, ty, z) !== BLOCK_AIR) return false;
    }
    return true;
  }

  function placeTree(x, y, z) {
    const trunkHeight = 3 + Math.floor(hash2(x + 19, z + 83) * 3);
    if (!canPlaceTree(x, y, z, trunkHeight)) return;

    for (let ty = 0; ty < trunkHeight; ty++) {
      setBlock(x, y + ty, z, BLOCK_WOOD);
    }

    const leafBase = y + trunkHeight - 2;
    for (let dy = 0; dy <= 3; dy++) {
      const radius = dy < 3 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
          const lx = x + dx;
          const ly = leafBase + dy;
          const lz = z + dz;
          if (!inBounds(lx, ly, lz)) continue;
          if (getBlock(lx, ly, lz) === BLOCK_AIR) {
            setBlock(lx, ly, lz, BLOCK_LEAVES);
          }
        }
      }
    }
  }

  function findTopSolidY(x, z) {
    for (let y = WORLD_Y - 2; y >= 1; y--) {
      const block = getBlock(x, y, z);
      if (block !== BLOCK_AIR && block !== BLOCK_WATER) {
        return y;
      }
    }
    return -1;
  }

  function columnIdx(x, z) {
    return x + WORLD_X * z;
  }

  function refreshColumnTopSurface(x, z) {
    columnTopSolidY[columnIdx(x, z)] = findTopSolidY(x, z);
  }

  function rebuildColumnTopSurfaceCache() {
    for (let x = 0; x < WORLD_X; x++) {
      for (let z = 0; z < WORLD_Z; z++) {
        refreshColumnTopSurface(x, z);
      }
    }
  }

  function columnSupportsSnow(x, z) {
    const col = columnIdx(x, z);
    const topY = columnTopSolidY[col];
    if (topY < 1 || topY >= WORLD_Y - 1) return false;
    if (getBlock(x, topY + 1, z) !== BLOCK_AIR) return false;
    const top = getBlock(x, topY, z);
    return top !== BLOCK_AIR && top !== BLOCK_WATER;
  }

  function snowAmountForTopFace(x, y, z) {
    const col = columnIdx(x, z);
    if (columnTopSolidY[col] !== y) return 0;
    return snowCoverByColumn[col];
  }

  function generateWorld() {
    for (let x = 0; x < WORLD_X; x++) {
      for (let z = 0; z < WORLD_Z; z++) {
        const basin = noise2(x * 0.05 + 240, z * 0.05 + 240);
        const basinDepth = Math.max(0, (0.45 - basin) * 12);
        const rawHeight = terrainHeight(x, z) - Math.floor(basinDepth);
        const h = Math.max(2, Math.min(WORLD_Y - 2, rawHeight));
        const biomeBand = noise2(x * 0.017 + 1450, z * 0.017 + 1450);
        const rockyBiome = Math.max(0, (biomeBand - 0.5) * 2);
        const rockyPatch = noise2(x * 0.075 + 1710, z * 0.075 + 1710);
        const rockRegion = noise2(x * 0.028 + 520, z * 0.028 + 520);
        const soilBase = 1 + Math.floor(noise2(x * 0.09 + 790, z * 0.09 + 790) * 3);
        const soilDepth = Math.max(1, soilBase - Math.floor(rockyBiome * 2));
        const outcropNoise = noise2(x * 0.11 + 930, z * 0.11 + 930);
        const surfaceRockDetail = noise2(x * 0.13 + 1330, z * 0.13 + 1330);

        for (let y = 0; y <= h; y++) {
          let b;
          if (y === h) {
            const rockySurfacePatch = rockyBiome > 0.3 && rockyPatch > 0.4;
            const highlandStone = h >= WATER_LEVEL + 7 && rockyBiome > 0.2;
            const isRockySurface =
              h >= WATER_LEVEL &&
              (rockySurfacePatch || highlandStone || (rockRegion > 0.72 && outcropNoise > 0.45));
            if (isRockySurface) {
              b = BLOCK_STONE;
            } else {
              b = h >= WATER_LEVEL ? BLOCK_GRASS : BLOCK_DIRT;
            }
          } else {
            const depth = h - y;
            const depthBias = Math.max(0, (WATER_LEVEL - y) * 0.06) + Math.max(0, depth - 1) * 0.18;
            const clusterNoise = noise2(x * 0.09 + y * 0.15 + 700, z * 0.09 + y * 0.11 + 700);
            const stoneChance = 0.04 + rockRegion * 0.25 + rockyBiome * 0.45 + clusterNoise * 0.2 + depthBias;
            const shallowRockPatch =
              depth <= 3 &&
              h >= WATER_LEVEL - 1 &&
              rockyPatch > 0.36 &&
              surfaceRockDetail > 0.48;
            b = depth <= soilDepth && stoneChance < 0.72 && !shallowRockPatch ? BLOCK_DIRT : BLOCK_STONE;
          }
          setBlock(x, y, z, b);
        }

        if (h < WATER_LEVEL) {
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            setBlock(x, y, z, BLOCK_WATER);
          }
        }
      }
    }

    for (let x = 2; x < WORLD_X - 2; x++) {
      for (let z = 2; z < WORLD_Z - 2; z++) {
        const topY = findTopSolidY(x, z);
        if (topY < 1) continue;
        const ground = getBlock(x, topY, z);
        if (ground !== BLOCK_GRASS) continue;
        if (topY <= WATER_LEVEL + 1) continue;
        const density = noise2(x * 0.11 + 400, z * 0.11 + 400);
        const jitter = hash2(x + 51, z + 17);
        if (density > 0.62 && jitter > 0.65) {
          placeTree(x, topY + 1, z);
        }
      }
    }
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  const weatherProfiles = {
    [WEATHER_SUNNY]: { min: 55, max: 110, particles: 0 },
    [WEATHER_RAIN]: { min: 10, max: 20, particles: 100 },
    [WEATHER_SNOW]: { min: 12, max: 22, particles: 76 },
  };

  const weather = {
    type: WEATHER_SUNNY,
    timer: 0,
    duration: 0,
    intensity: 0,
    particles: [],
    windPhase: randomRange(0, Math.PI * 2),
  };

  function getWeatherDuration(type) {
    const profile = weatherProfiles[type] || weatherProfiles[WEATHER_SUNNY];
    return randomRange(profile.min, profile.max);
  }

  function pickNextWeather(current) {
    const roll = Math.random();
    if (current === WEATHER_SUNNY) {
      if (roll < 0.72) return WEATHER_SUNNY;
      if (roll < 0.9) return WEATHER_RAIN;
      return WEATHER_SNOW;
    }

    if (current === WEATHER_RAIN) {
      if (roll < 0.76) return WEATHER_SUNNY;
      if (roll < 0.93) return WEATHER_RAIN;
      return WEATHER_SNOW;
    }

    if (roll < 0.8) return WEATHER_SUNNY;
    if (roll < 0.94) return WEATHER_RAIN;
    return WEATHER_SNOW;
  }

  function createWeatherParticle(type, spawnAbove) {
    if (type === WEATHER_RAIN) {
      return {
        x: randomRange(-12, RENDER_W + 12),
        y: spawnAbove ? randomRange(-RENDER_H, -4) : randomRange(-6, RENDER_H + 10),
        vx: randomRange(-22, -8),
        vy: randomRange(130, 220),
        len: randomRange(4, 9),
      };
    }
    return {
      x: randomRange(-8, RENDER_W + 8),
      y: spawnAbove ? randomRange(-RENDER_H, -4) : randomRange(-6, RENDER_H + 8),
      vx: randomRange(-5, 5),
      vy: randomRange(20, 48),
      size: randomRange(1.2, 2.6),
      driftPhase: randomRange(0, Math.PI * 2),
      wobble: randomRange(0.4, 1.4),
    };
  }

  function resetWeatherParticle(particle, type) {
    const replacement = createWeatherParticle(type, true);
    Object.assign(particle, replacement);
  }

  function setWeather(nextType) {
    const prevType = weather.type;
    weather.type = nextType;
    weather.duration = getWeatherDuration(nextType);
    weather.timer = weather.duration;

    if (prevType === WEATHER_SNOW && nextType !== WEATHER_SNOW) {
      snowCoverByColumn.fill(0);
    }
  }

  function updateWeatherParticles(dt) {
    const isPrecipitating = weather.type === WEATHER_RAIN || weather.type === WEATHER_SNOW;
    const targetCount = isPrecipitating
      ? Math.floor((weatherProfiles[weather.type].particles || 0) * Math.max(0, weather.intensity))
      : 0;

    while (weather.particles.length < targetCount) {
      weather.particles.push(createWeatherParticle(weather.type, false));
    }
    if (weather.particles.length > targetCount) {
      weather.particles.length = targetCount;
    }
    if (!weather.particles.length) return;

    const wind = Math.sin(weather.windPhase) * (weather.type === WEATHER_SNOW ? 16 : 10);
    for (const particle of weather.particles) {
      if (weather.type === WEATHER_RAIN) {
        particle.x += (particle.vx + wind) * dt;
        particle.y += particle.vy * dt;
      } else {
        particle.driftPhase += dt * (0.9 + particle.wobble * 0.5);
        particle.x += (wind * 0.2 + Math.sin(particle.driftPhase) * particle.wobble * 9 + particle.vx) * dt;
        particle.y += particle.vy * dt;
      }

      if (particle.y > RENDER_H + 10 || particle.x < -20 || particle.x > RENDER_W + 20) {
        resetWeatherParticle(particle, weather.type);
      }
    }
  }

  function updateWeather(dt) {
    weather.timer -= dt;
    weather.windPhase += dt * 0.2;
    if (weather.timer <= 0) {
      setWeather(pickNextWeather(weather.type));
    }

    const targetIntensity = weather.type === WEATHER_SUNNY ? 0 : 1;
    const easeSpeed = weather.type === WEATHER_SUNNY ? 3.5 : 2.3;
    weather.intensity += (targetIntensity - weather.intensity) * Math.min(1, dt * easeSpeed);

    if (weather.type === WEATHER_SNOW) {
      const accumulation = dt * 0.2;
      for (let x = 0; x < WORLD_X; x++) {
        for (let z = 0; z < WORLD_Z; z++) {
          if (!columnSupportsSnow(x, z)) continue;
          const col = columnIdx(x, z);
          snowCoverByColumn[col] = Math.min(1, snowCoverByColumn[col] + accumulation);
        }
      }
    }

    updateWeatherParticles(dt);
  }

  function getSnowCoveragePercent() {
    let covered = 0;
    for (let i = 0; i < snowCoverByColumn.length; i++) {
      if (snowCoverByColumn[i] > 0.08) covered++;
    }
    return Math.round((covered / COLUMN_COUNT) * 100);
  }

  function renderWeatherEffects() {
    const intensity = Math.max(0, Math.min(1, weather.intensity));
    if (intensity <= 0.02) return;

    if (weather.type === WEATHER_RAIN) {
      ctx.strokeStyle = `rgba(196, 218, 238, ${0.2 + intensity * 0.32})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const particle of weather.particles) {
        const tailX = particle.x + particle.vx * 0.028;
        const tailY = particle.y - particle.len;
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(tailX, tailY);
      }
      ctx.stroke();

      ctx.fillStyle = `rgba(72, 89, 108, ${0.08 + intensity * 0.08})`;
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);
      return;
    }

    ctx.fillStyle = `rgba(240, 246, 252, ${0.4 + intensity * 0.26})`;
    for (const particle of weather.particles) {
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
    }
    ctx.fillStyle = `rgba(218, 228, 238, ${0.05 + intensity * 0.09})`;
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  }

  function findGroundForEntity(x, z) {
    if (x < 2 || x > WORLD_X - 3 || z < 2 || z > WORLD_Z - 3) return null;
    const topY = findTopSolidY(Math.floor(x), Math.floor(z));
    if (topY < 0) return null;
    const ground = getBlock(Math.floor(x), topY, Math.floor(z));
    if (ground !== BLOCK_GRASS) return null;
    if (topY <= WATER_LEVEL + 1) return null;
    if (getBlock(Math.floor(x), topY + 1, Math.floor(z)) !== BLOCK_AIR) return null;
    return topY + 1;
  }

  function spawnAnimals() {
    animals.length = 0;

    for (const name of animalNames) {
      for (let tries = 0; tries < 180; tries++) {
        const x = randomRange(3, WORLD_X - 3);
        const z = randomRange(3, WORLD_Z - 3);
        const y = findGroundForEntity(x, z);
        if (y === null) continue;
        animals.push({
          type: name,
          x,
          y,
          z,
          dir: randomRange(0, Math.PI * 2),
          turnTimer: randomRange(1.3, 2.8),
          pauseTimer: randomRange(0.2, 1.1),
          stepPhase: randomRange(0, Math.PI * 2),
        });
        break;
      }
    }
  }

  function updateAnimals(dt) {
    for (const animal of animals) {
      animal.turnTimer -= dt;
      animal.stepPhase += dt * (1.7 + animalTypes[animal.type].bob);

      if (animal.turnTimer <= 0) {
        animal.turnTimer = randomRange(1.1, 2.8);
        animal.dir += randomRange(-1.2, 1.2);
        animal.pauseTimer = randomRange(0.2, 1.0);
      }

      if (animal.pauseTimer > 0) {
        animal.pauseTimer -= dt;
        continue;
      }

      const speed = animalTypes[animal.type].speed;
      const nx = animal.x + Math.sin(animal.dir) * speed * dt;
      const nz = animal.z + Math.cos(animal.dir) * speed * dt;
      const ny = findGroundForEntity(nx, nz);
      if (ny === null) {
        animal.dir += randomRange(-1.6, 1.6);
        animal.pauseTimer = randomRange(0.25, 0.8);
        continue;
      }

      animal.x = nx;
      animal.z = nz;
      animal.y = ny;
    }
  }

  const blockColors = {
    [BLOCK_GRASS]: {
      top: [74, 154, 71],
      side: [106, 86, 57],
      bottom: [88, 70, 44],
    },
    [BLOCK_DIRT]: {
      top: [118, 92, 60],
      side: [112, 86, 56],
      bottom: [94, 70, 45],
    },
    [BLOCK_STONE]: {
      top: [122, 126, 130],
      side: [104, 108, 112],
      bottom: [92, 96, 100],
    },
    [BLOCK_WATER]: {
      top: [60, 126, 204],
      side: [54, 112, 186],
      bottom: [40, 92, 152],
    },
    [BLOCK_WOOD]: {
      top: [139, 112, 76],
      side: [124, 96, 62],
      bottom: [102, 79, 52],
    },
    [BLOCK_LEAVES]: {
      top: [66, 142, 70],
      side: [58, 126, 62],
      bottom: [50, 112, 54],
    },
  };

  function isSolidBlock(block) {
    return block !== BLOCK_AIR && block !== BLOCK_WATER;
  }

  const blockNames = {
    [BLOCK_GRASS]: "Grass",
    [BLOCK_DIRT]: "Dirt",
    [BLOCK_STONE]: "Stone",
    [BLOCK_WATER]: "Water",
    [BLOCK_WOOD]: "Wood",
    [BLOCK_LEAVES]: "Leaves",
  };

  function getBlockName(block) {
    return blockNames[block] || "Block";
  }

  function svgDataUri(svg) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function createBlockIcon(block) {
    const palette = blockColors[block] || blockColors[BLOCK_STONE];
    const top = `rgb(${palette.top[0]},${palette.top[1]},${palette.top[2]})`;
    const side = `rgb(${palette.side[0]},${palette.side[1]},${palette.side[2]})`;
    const bottom = `rgb(${palette.bottom[0]},${palette.bottom[1]},${palette.bottom[2]})`;
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${top}"/>
            <stop offset="0.58" stop-color="${side}"/>
            <stop offset="1" stop-color="${bottom}"/>
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="28" height="28" rx="4" fill="url(#g)" stroke="rgba(0,0,0,0.45)" stroke-width="1.5"/>
        <path d="M6 19.5h28" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      </svg>`,
    );
  }

  function createPickaxeIcon() {
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <rect x="18.8" y="14" width="3.8" height="20" rx="1.5" fill="#9b6e43"/>
        <rect x="19.8" y="14" width="1.8" height="20" rx="0.9" fill="#c29161"/>
        <path d="M8 17c4-7 12-9 23-8l1 4c-8 0-13 1-17 5l-7-1z" fill="#9ca4ae" stroke="#79838f" stroke-width="1"/>
      </svg>`,
    );
  }

  function createHandIcon() {
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <path d="M14 33V18.5c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2v6.2h1.8V15.5c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2v9.2h1.7v-7.7c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2V29c0 3.8-3.2 7-7 7H21c-3.9 0-7-3.1-7-7z" fill="#efc18c" stroke="#bf9363" stroke-width="1.4"/>
      </svg>`,
    );
  }

  const blockIcons = {
    [BLOCK_GRASS]: createBlockIcon(BLOCK_GRASS),
    [BLOCK_DIRT]: createBlockIcon(BLOCK_DIRT),
    [BLOCK_STONE]: createBlockIcon(BLOCK_STONE),
    [BLOCK_WATER]: createBlockIcon(BLOCK_WATER),
    [BLOCK_WOOD]: createBlockIcon(BLOCK_WOOD),
    [BLOCK_LEAVES]: createBlockIcon(BLOCK_LEAVES),
  };

  const toolIcons = {
    pickaxe: createPickaxeIcon(),
    hand: createHandIcon(),
  };

  function getBlockIcon(block) {
    return blockIcons[block] || blockIcons[BLOCK_STONE];
  }

  function getItemIcon(item) {
    if (!item) return getBlockIcon(BLOCK_STONE);
    if (item.type === "block") return getBlockIcon(item.block);
    return toolIcons[item.tool] || toolIcons.hand;
  }

  const toolbarItems = [
    { type: "block", block: BLOCK_GRASS, label: "1", name: "Grass", initialCount: 24 },
    { type: "block", block: BLOCK_DIRT, label: "2", name: "Dirt", initialCount: 24 },
    { type: "block", block: BLOCK_STONE, label: "3", name: "Stone", initialCount: 24 },
    { type: "block", block: BLOCK_WOOD, label: "4", name: "Wood", initialCount: 0 },
    { type: "block", block: BLOCK_LEAVES, label: "5", name: "Leaves", initialCount: 0 },
    { type: "block", block: BLOCK_WATER, label: "6", name: "Water", initialCount: 0 },
    { type: "tool", tool: "pickaxe", label: "7", name: "Pickaxe" },
    { type: "tool", tool: "hand", label: "8", name: "Hand" },
  ];
  const inventoryCounts = new Map(
    toolbarItems
      .filter((item) => item.type === "block")
      .map((item) => [item.block, item.initialCount || 0]),
  );
  let selectedItem = 6;
  let selectedBlock = BLOCK_DIRT;
  let inventoryOpen = false;
  let inventoryTargetSlot = 0;

  function refreshSelectedItemState() {
    const item = toolbarItems[selectedItem];
    if (item && item.type === "block") {
      selectedBlock = item.block;
    }
  }

  function canBreakBlocks() {
    return true;
  }

  function usingPickaxe() {
    const item = toolbarItems[selectedItem];
    return !!(item && item.type === "tool" && item.tool === "pickaxe");
  }

  function getInventoryCount(block) {
    return inventoryCounts.get(block) || 0;
  }

  function addBlockToInventory(block, amount) {
    if (!inventoryCounts.has(block) || amount <= 0) return;
    inventoryCounts.set(block, getInventoryCount(block) + amount);
  }

  function consumeSelectedBlock() {
    if (selectedBlock === BLOCK_AIR) return false;
    const count = getInventoryCount(selectedBlock);
    if (count <= 0) return false;
    inventoryCounts.set(selectedBlock, count - 1);
    return true;
  }

  function renderInventory() {
    if (!inventoryOpen) return;

    inventoryGridEl.innerHTML = "";
    const targetItem = toolbarItems[inventoryTargetSlot];

    for (const [block, count] of inventoryCounts.entries()) {
      if (count <= 0) continue;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "inventoryItem";
      if (targetItem && targetItem.type === "block" && targetItem.block === block) {
        button.classList.add("active");
      }
      const blockName = getBlockName(block);
      button.innerHTML = `<img class="inventoryIcon" src="${getBlockIcon(block)}" alt="${blockName}" /><span class="inventoryName">${blockName}</span><span class="inventoryCount">${count}</span>`;
      button.title = `Assign ${getBlockName(block)} to slot ${inventoryTargetSlot + 1}`;
      button.addEventListener("click", () => {
        const slot = toolbarItems[inventoryTargetSlot];
        if (!slot || slot.type !== "block") return;
        slot.block = block;
        slot.name = getBlockName(block);
        refreshSelectedItemState();
        renderToolbar();
        renderInventory();
      });
      inventoryGridEl.appendChild(button);
    }

    if (!inventoryGridEl.children.length) {
      const empty = document.createElement("div");
      empty.className = "inventoryEmpty";
      empty.textContent = "No collected blocks yet. Break blocks with the pickaxe.";
      inventoryGridEl.appendChild(empty);
    }
  }

  function openInventory() {
    inventoryOpen = true;
    keys.clear();
    if (toolbarItems[selectedItem] && toolbarItems[selectedItem].type === "block") {
      inventoryTargetSlot = selectedItem;
    }
    document.body.classList.add("inventory-open");
    inventoryPanelEl.classList.add("open");
    renderToolbar();
    renderInventory();
    if (locked) {
      document.exitPointerLock();
    }
  }

  function closeInventory() {
    inventoryOpen = false;
    document.body.classList.remove("inventory-open");
    inventoryPanelEl.classList.remove("open");
    renderToolbar();
  }

  function toggleInventory() {
    if (inventoryOpen) {
      closeInventory();
    } else {
      openInventory();
    }
  }

  function renderToolbar() {
    toolbarEl.innerHTML = "";
    toolbarItems.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `toolItem${selectedItem === index ? " selected" : ""}`;
      if (inventoryOpen && inventoryTargetSlot === index && item.type === "block") {
        button.classList.add("assignTarget");
      }
      const isBlockItem = item.type === "block";
      const count = isBlockItem ? getInventoryCount(item.block) : null;
      if (isBlockItem && count === 0) {
        button.classList.add("empty");
      }
      button.title = `${item.name} (${item.label})`;
      button.setAttribute("aria-label", `Select ${item.name}`);
      button.innerHTML = `<span class="slotKey">${item.label}</span><img class="slotIcon" src="${getItemIcon(item)}" alt="${item.name}" />${
        isBlockItem ? `<span class="slotCount">${count}</span>` : `<span class="slotToolDot" aria-hidden="true"></span>`
      }`;
      button.addEventListener("click", () => {
        if (inventoryOpen && item.type === "block") {
          inventoryTargetSlot = index;
          selectedItem = index;
          refreshSelectedItemState();
          renderToolbar();
          renderInventory();
          return;
        }
        selectedItem = index;
        refreshSelectedItemState();
        renderToolbar();
      });
      toolbarEl.appendChild(button);
    });
  }

  const player = {
    x: WORLD_X / 2,
    y: 18,
    z: WORLD_Z / 2,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: -0.3,
    height: 1.7,
    radius: 0.3,
    onGround: false,
  };

  const keys = new Set();
  let locked = false;
  let swingAnim = 0;
  let swingPulse = 0;
  let hitFlash = 0;
  let miningActive = false;
  let miningTimer = 0;
  let pendingMineOnLock = false;
  const miningInterval = 0.14;
  let fpsValue = 60;

  const animalTypes = {
    pig: {
      body: "#f0a9b8",
      snout: "#d98ea0",
      eye: "#2a1b1f",
      accent: "#d88ea0",
      leg: "#ca8294",
      speed: 0.74,
      bob: 0.95,
      scale: 1.16,
    },
    sheep: {
      body: "#ececec",
      snout: "#bebebe",
      eye: "#1e1e1e",
      accent: "#d6d6d6",
      leg: "#4e4e4e",
      speed: 0.58,
      bob: 0.82,
      scale: 1.22,
    },
    chicken: {
      body: "#ffffff",
      snout: "#f0b93f",
      eye: "#191919",
      accent: "#ef4335",
      leg: "#d59d41",
      speed: 0.93,
      bob: 1.28,
      scale: 1.28,
    },
  };
  const animalNames = [];
  const animals = [];

  let audioContext = null;
  let audioMasterGain = null;
  let musicBusGain = null;
  let sfxBusGain = null;
  let musicNodes = [];
  let noiseBuffer = null;
  let musicStarted = false;
  let musicMuted = false;
  let stepSoundTimer = 0;

  function forwardVector() {
    const cp = Math.cos(player.pitch);
    return {
      x: Math.sin(player.yaw) * cp,
      // Must match center ray direction used by render() pitch rotation.
      y: Math.sin(player.pitch),
      z: Math.cos(player.yaw) * cp,
    };
  }

  function setMusicMuted(muted) {
    musicMuted = muted;
  }

  function ensureAudioGraph() {
    if (audioContext && audioMasterGain && musicBusGain && sfxBusGain) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    audioMasterGain = audioContext.createGain();
    audioMasterGain.gain.value = musicMuted ? 0 : 0.14;
    musicBusGain = audioContext.createGain();
    musicBusGain.gain.value = 0.92;
    sfxBusGain = audioContext.createGain();
    sfxBusGain.gain.value = 0.68;

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2400;
    lowpass.Q.value = 0.35;

    const highshelf = audioContext.createBiquadFilter();
    highshelf.type = "highshelf";
    highshelf.frequency.value = 2800;
    highshelf.gain.value = -8;

    musicBusGain.connect(audioMasterGain);
    sfxBusGain.connect(audioMasterGain);
    audioMasterGain.connect(lowpass);
    lowpass.connect(highshelf);
    highshelf.connect(audioContext.destination);
  }

  function cleanupNodeChain(nodes) {
    for (const node of nodes) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect errors from already-disconnected nodes.
      }
    }
  }

  function makeNoiseBuffer() {
    if (!audioContext) return null;
    if (noiseBuffer) return noiseBuffer;
    const sampleRate = audioContext.sampleRate;
    const duration = 0.25;
    const length = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.55;
    }
    noiseBuffer = buffer;
    return noiseBuffer;
  }

  function playTone({
    wave = "sine",
    from = 440,
    to = from,
    duration = 0.12,
    volume = 0.11,
    attack = 0.008,
    release = 0.09,
    filterHz = 3400,
  }) {
    ensureAudioGraph();
    if (!audioContext || !sfxBusGain || musicMuted) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(20, from), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);

    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    filter.Q.value = 0.45;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + release + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBusGain);
    osc.start(now);
    osc.stop(now + duration + release + 0.01);
    osc.addEventListener("ended", () => cleanupNodeChain([osc, filter, gain]), { once: true });
  }

  function playNoise({ duration = 0.09, volume = 0.08, lowpass = 1200 }) {
    ensureAudioGraph();
    if (!audioContext || !sfxBusGain || musicMuted) return;
    const buffer = makeNoiseBuffer();
    if (!buffer) return;
    const now = audioContext.currentTime;
    const src = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    src.buffer = buffer;

    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    filter.Q.value = 0.6;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBusGain);
    src.start(now);
    src.stop(now + duration + 0.01);
    src.addEventListener("ended", () => cleanupNodeChain([src, filter, gain]), { once: true });
  }

  function playMineSound() {
    playNoise({ duration: 0.08, volume: 0.1, lowpass: 900 });
    playTone({ wave: "triangle", from: 190, to: 100, duration: 0.11, volume: 0.095, filterHz: 1200 });
  }

  function playPlaceSound() {
    playTone({ wave: "square", from: 280, to: 200, duration: 0.065, volume: 0.065, filterHz: 1400 });
    playTone({ wave: "triangle", from: 170, to: 130, duration: 0.09, volume: 0.04, filterHz: 1100 });
  }

  function playJumpSound() {
    playTone({ wave: "triangle", from: 360, to: 570, duration: 0.1, volume: 0.078, filterHz: 1900 });
  }

  function playStepSound() {
    playNoise({ duration: 0.05, volume: 0.04, lowpass: 650 });
    playTone({ wave: "sine", from: 120, to: 100, duration: 0.04, volume: 0.024, filterHz: 700 });
  }

  // Procedural ambient music system
  let ambientMusicActive = false;
  let ambientNodes = [];
  let ambientIntervalId = null;

  const ambientScales = [
    [0, 2, 4, 7, 9],      // Major pentatonic
    [0, 3, 5, 7, 10],     // Minor pentatonic
    [0, 2, 4, 5, 7, 9],   // Major scale subset
    [0, 2, 3, 5, 7, 8, 10] // Natural minor
  ];

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function pickRandomNote(baseNote, scale) {
    const octaveShift = Math.floor(Math.random() * 2) * 12;
    const scaleNote = scale[Math.floor(Math.random() * scale.length)];
    return baseNote + scaleNote + octaveShift;
  }

  function createAmbientPad(freq, duration, volume) {
    if (!audioContext || !musicBusGain) return null;
    const now = audioContext.currentTime;

    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    const padGain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    osc1.type = "sine";
    osc1.frequency.value = freq;
    osc2.type = "sine";
    osc2.frequency.value = freq * 1.002;

    lfo.type = "sine";
    lfo.frequency.value = 0.15 + Math.random() * 0.1;
    lfoGain.gain.value = freq * 0.008;

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    filter.type = "lowpass";
    filter.frequency.value = 800 + Math.random() * 400;
    filter.Q.value = 0.5;

    const attack = duration * 0.3;
    const release = duration * 0.4;

    padGain.gain.setValueAtTime(0.0001, now);
    padGain.gain.linearRampToValueAtTime(volume, now + attack);
    padGain.gain.setValueAtTime(volume, now + duration - release);
    padGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(padGain);
    padGain.connect(musicBusGain);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);
    osc1.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);
    lfo.stop(now + duration + 0.1);

    const cleanup = () => cleanupNodeChain([osc1, osc2, lfo, lfoGain, padGain, filter]);
    osc1.addEventListener("ended", cleanup, { once: true });

    return { osc1, osc2, lfo, lfoGain, padGain, filter };
  }

  function createWindAmbience() {
    if (!audioContext || !musicBusGain) return null;

    const bufferSize = audioContext.sampleRate * 2;
    const buffer = audioContext.createBuffer(2, bufferSize, audioContext.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = 0.99 * lastOut + 0.01 * white;
        data[i] = lastOut * 0.5;
      }
    }

    const src = audioContext.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 400;
    filter.Q.value = 0.3;

    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const windGain = audioContext.createGain();
    windGain.gain.value = 0.025;

    src.connect(filter);
    filter.connect(windGain);
    windGain.connect(musicBusGain);

    src.start();
    lfo.start();

    ambientNodes.push({ src, filter, lfo, lfoGain, windGain });
    return { src, filter, lfo, lfoGain, windGain };
  }

  function playAmbientMelody() {
    if (!audioContext || !musicBusGain || musicMuted) return;

    const scale = ambientScales[Math.floor(Math.random() * ambientScales.length)];
    const baseNote = 48 + Math.floor(Math.random() * 3) * 12;

    const noteCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < noteCount; i++) {
      const delay = i * (1.5 + Math.random() * 2);
      setTimeout(() => {
        if (!ambientMusicActive) return;
        const midiNote = pickRandomNote(baseNote, scale);
        const freq = midiToFreq(midiNote);
        const duration = 4 + Math.random() * 6;
        const volume = 0.015 + Math.random() * 0.01;
        createAmbientPad(freq, duration, volume);
      }, delay * 1000);
    }
  }

  function startBackgroundMusic() {
    if (ambientMusicActive) return;
    ensureAudioGraph();
    if (!audioContext || !musicBusGain) return;

    ambientMusicActive = true;

    createWindAmbience();

    playAmbientMelody();
    ambientIntervalId = setInterval(() => {
      if (ambientMusicActive && !musicMuted) {
        playAmbientMelody();
      }
    }, 6000 + Math.random() * 4000);
  }

  function stopBackgroundMusic() {
    ambientMusicActive = false;
    if (ambientIntervalId) {
      clearInterval(ambientIntervalId);
      ambientIntervalId = null;
    }
    for (const nodeSet of ambientNodes) {
      for (const key in nodeSet) {
        const node = nodeSet[key];
        if (node && typeof node.stop === "function") {
          try { node.stop(); } catch {}
        }
        if (node && typeof node.disconnect === "function") {
          try { node.disconnect(); } catch {}
        }
      }
    }
    ambientNodes = [];
  }

  function ensureBackgroundMusic() {
    if (!ambientMusicActive) {
      startBackgroundMusic();
    }
  }

  function castRay(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);

    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;

    const tDeltaX = dx === 0 ? 1e9 : Math.abs(1 / dx);
    const tDeltaY = dy === 0 ? 1e9 : Math.abs(1 / dy);
    const tDeltaZ = dz === 0 ? 1e9 : Math.abs(1 / dz);

    const fracX = ox - Math.floor(ox);
    const fracY = oy - Math.floor(oy);
    const fracZ = oz - Math.floor(oz);

    let tMaxX = dx > 0 ? (1 - fracX) * tDeltaX : fracX * tDeltaX;
    let tMaxY = dy > 0 ? (1 - fracY) * tDeltaY : fracY * tDeltaY;
    let tMaxZ = dz > 0 ? (1 - fracZ) * tDeltaZ : fracZ * tDeltaZ;

    let face = "side";
    let lastAxis = "x";

    while (true) {
      if (!inBounds(x, y, z)) {
        return null;
      }

      const block = getBlock(x, y, z);
      if (block !== BLOCK_AIR) {
        let nx = 0;
        let ny = 0;
        let nz = 0;
        if (lastAxis === "x") nx = -stepX;
        if (lastAxis === "y") ny = -stepY;
        if (lastAxis === "z") nz = -stepZ;
        return {
          block,
          x,
          y,
          z,
          dist: Math.min(tMaxX, tMaxY, tMaxZ),
          face,
          normal: { x: nx, y: ny, z: nz },
        };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) return null;
        x += stepX;
        tMaxX += tDeltaX;
        face = "side";
        lastAxis = "x";
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) return null;
        y += stepY;
        tMaxY += tDeltaY;
        face = stepY > 0 ? "bottom" : "top";
        lastAxis = "y";
      } else {
        if (tMaxZ > maxDist) return null;
        z += stepZ;
        tMaxZ += tDeltaZ;
        face = "side";
        lastAxis = "z";
      }
    }
  }

  function traceRayTarget(maxDist, solidsOnly) {
    const eyeY = player.y + player.height * 0.92;
    const fwd = forwardVector();
    const step = 0.02;

    let lastX = -99999;
    let lastY = -99999;
    let lastZ = -99999;
    let prevEmpty = null;

    for (let t = 0; t <= maxDist; t += step) {
      const x = Math.floor(player.x + fwd.x * t);
      const y = Math.floor(eyeY + fwd.y * t);
      const z = Math.floor(player.z + fwd.z * t);

      if (!inBounds(x, y, z)) return null;
      if (x === lastX && y === lastY && z === lastZ) continue;
      lastX = x;
      lastY = y;
      lastZ = z;

      const block = getBlock(x, y, z);
      if (block === BLOCK_AIR) {
        prevEmpty = { x, y, z };
        continue;
      }
      if (solidsOnly && !isSolidBlock(block)) {
        continue;
      }

      return { x, y, z, block, prevEmpty };
    }

    return null;
  }

  function isSolidAt(x, y, z) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    return isSolidBlock(getBlock(bx, by, bz));
  }

  function collidesAt(px, py, pz) {
    const r = player.radius;
    const h = player.height;
    const eps = 0.0001;

    // Keep a tiny inset so touching a face does not count as penetration.
    const minX = Math.floor(px - r + eps);
    const maxX = Math.floor(px + r - eps);
    const minY = Math.floor(py + eps);
    const maxY = Math.floor(py + h - eps);
    const minZ = Math.floor(pz - r + eps);
    const maxZ = Math.floor(pz + r - eps);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (isSolidBlock(getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  function tryMove(dt) {
    player.onGround = false;

    let nx = player.x + player.vx * dt;
    if (!collidesAt(nx, player.y, player.z)) {
      player.x = nx;
    } else {
      player.vx = 0;
    }

    let nz = player.z + player.vz * dt;
    if (!collidesAt(player.x, player.y, nz)) {
      player.z = nz;
    } else {
      player.vz = 0;
    }

    let ny = player.y + player.vy * dt;
    if (!collidesAt(player.x, ny, player.z)) {
      player.y = ny;
    } else {
      if (player.vy < 0) player.onGround = true;
      player.vy = 0;

      if (ny > player.y) {
        player.y = Math.floor(ny + player.height) - player.height - 0.001;
      } else {
        player.y = Math.floor(ny) + 1.001;
      }
    }

    if (player.y < 0) {
      player.y = WORLD_Y - 1;
      player.vy = 0;
    }
  }

  function update(dt) {
    const accel = 22;
    const maxSpeed = 6;
    const friction = 10;
    const gravity = 24;
    const jumpSpeed = 8.7;

    let mx = 0;
    let mz = 0;
    if (keys.has("KeyW")) mz += 1;
    if (keys.has("KeyS")) mz -= 1;
    if (keys.has("KeyA")) mx -= 1;
    if (keys.has("KeyD")) mx += 1;

    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;

    const sy = Math.sin(player.yaw);
    const cy = Math.cos(player.yaw);

    const wishX = mx * cy + mz * sy;
    const wishZ = mz * cy - mx * sy;

    player.vx += wishX * accel * dt;
    player.vz += wishZ * accel * dt;

    const speed = Math.hypot(player.vx, player.vz);
    if (speed > maxSpeed) {
      const s = maxSpeed / speed;
      player.vx *= s;
      player.vz *= s;
    }

    if (mx === 0 && mz === 0) {
      const drop = Math.max(0, 1 - friction * dt);
      player.vx *= drop;
      player.vz *= drop;
    }

    player.vy -= gravity * dt;
    if (keys.has("Space") && player.onGround) {
      player.vy = jumpSpeed;
      player.onGround = false;
      playJumpSound();
    }

    tryMove(dt);

    const moveSpeed = Math.hypot(player.vx, player.vz);
    const walking = player.onGround && moveSpeed > 1.3 && (Math.abs(mx) > 0 || Math.abs(mz) > 0) && locked;
    if (walking) {
      stepSoundTimer -= dt;
      if (stepSoundTimer <= 0) {
        playStepSound();
        stepSoundTimer = Math.max(0.14, 0.31 - Math.min(0.12, moveSpeed * 0.02));
      }
    } else {
      stepSoundTimer = Math.min(stepSoundTimer, 0.08);
    }

    if (player.x < 1) player.x = 1;
    if (player.z < 1) player.z = 1;
    if (player.x > WORLD_X - 2) player.x = WORLD_X - 2;
    if (player.z > WORLD_Z - 2) player.z = WORLD_Z - 2;
  }

  function setPixel(i, r, g, b) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  }

  function render() {
    const fov = Math.PI / 2.1;
    const aspect = RENDER_W / RENDER_H;

    const cp = Math.cos(player.pitch);
    const sp = Math.sin(player.pitch);
    const cy = Math.cos(player.yaw);
    const sy = Math.sin(player.yaw);

    const camX = player.x;
    const camY = player.y + player.height * 0.92;
    const camZ = player.z;
    const weatherBlend = Math.max(0, Math.min(1, weather.intensity));
    let skyLowR = 90;
    let skyLowG = 150;
    let skyLowB = 210;
    let skyHighR = 160;
    let skyHighG = 205;
    let skyHighB = 240;
    let fogR = 135;
    let fogG = 190;
    let fogB = 240;

    if (weather.type === WEATHER_RAIN) {
      skyLowR = lerp(skyLowR, 76, weatherBlend);
      skyLowG = lerp(skyLowG, 104, weatherBlend);
      skyLowB = lerp(skyLowB, 140, weatherBlend);
      skyHighR = lerp(skyHighR, 132, weatherBlend);
      skyHighG = lerp(skyHighG, 160, weatherBlend);
      skyHighB = lerp(skyHighB, 184, weatherBlend);
      fogR = lerp(fogR, 112, weatherBlend);
      fogG = lerp(fogG, 140, weatherBlend);
      fogB = lerp(fogB, 166, weatherBlend);
    } else if (weather.type === WEATHER_SNOW) {
      skyLowR = lerp(skyLowR, 160, weatherBlend);
      skyLowG = lerp(skyLowG, 182, weatherBlend);
      skyLowB = lerp(skyLowB, 202, weatherBlend);
      skyHighR = lerp(skyHighR, 202, weatherBlend);
      skyHighG = lerp(skyHighG, 218, weatherBlend);
      skyHighB = lerp(skyHighB, 232, weatherBlend);
      fogR = lerp(fogR, 186, weatherBlend);
      fogG = lerp(fogG, 204, weatherBlend);
      fogB = lerp(fogB, 222, weatherBlend);
    }

    let p = 0;
    for (let y = 0; y < RENDER_H; y++) {
      const ny = 1 - ((y + 0.5) / RENDER_H) * 2;
      for (let x = 0; x < RENDER_W; x++) {
        const nx = (((x + 0.5) / RENDER_W) * 2 - 1) * aspect;

        const px = nx * Math.tan(fov * 0.5);
        const py = ny * Math.tan(fov * 0.5);
        const pz = 1;

        let dx = px;
        let dy = py;
        let dz = pz;

        const ry = dy * cp + dz * sp;
        const rz = dz * cp - dy * sp;
        dy = ry;
        dz = rz;

        const rx = dx * cy + dz * sy;
        const rz2 = dz * cy - dx * sy;
        dx = rx;
        dz = rz2;

        const inv = 1 / Math.hypot(dx, dy, dz);
        dx *= inv;
        dy *= inv;
        dz *= inv;

        const hit = castRay(camX, camY, camZ, dx, dy, dz, 45);

        if (!hit) {
          const t = Math.max(0, (dy + 1) * 0.5);
          const sr = Math.floor(lerp(skyLowR, skyHighR, t));
          const sg = Math.floor(lerp(skyLowG, skyHighG, t));
          const sb = Math.floor(lerp(skyLowB, skyHighB, t));
          setPixel(p, sr, sg, sb);
          p += 4;
          continue;
        }

        const palette = blockColors[hit.block] || blockColors[BLOCK_STONE];
        let color = palette.side;
        if (hit.face === "top") color = palette.top;
        if (hit.face === "bottom") color = palette.bottom;
        let baseR = color[0];
        let baseG = color[1];
        let baseB = color[2];
        if (hit.face === "top") {
          const snowAmount = snowAmountForTopFace(hit.x, hit.y, hit.z);
          if (snowAmount > 0.01) {
            baseR = lerp(baseR, 236, snowAmount);
            baseG = lerp(baseG, 240, snowAmount);
            baseB = lerp(baseB, 244, snowAmount);
          }
        }

        const dist = Math.max(0.01, hit.dist);
        const shadeByFace = hit.face === "top" ? 1.0 : hit.face === "bottom" ? 0.55 : 0.78;
        const fog = Math.min(1, dist / 42);
        const light = Math.max(0.2, 1 - dist * 0.035) * shadeByFace;

        const r = Math.floor(baseR * light * (1 - fog) + fogR * fog);
        const g = Math.floor(baseG * light * (1 - fog) + fogG * fog);
        const b = Math.floor(baseB * light * (1 - fog) + fogB * fog);

        setPixel(p, r, g, b);
        p += 4;
      }
    }

    ctx.putImageData(image, 0, 0);
    renderAnimals();
    renderWeatherEffects();
    drawHeldItem();
  }

  function renderAnimals() {
    const fov = Math.PI / 2.1;
    const aspect = RENDER_W / RENDER_H;
    const tanHalfFov = Math.tan(fov * 0.5);
    const cp = Math.cos(player.pitch);
    const sp = Math.sin(player.pitch);
    const cy = Math.cos(player.yaw);
    const sy = Math.sin(player.yaw);

    const camX = player.x;
    const camY = player.y + player.height * 0.92;
    const camZ = player.z;

    const drawList = [];
    for (const animal of animals) {
      const wx = animal.x - camX;
      const wy = animal.y - camY + Math.sin(animal.stepPhase) * 0.06;
      const wz = animal.z - camZ;

      const yawX = wx * cy - wz * sy;
      const yawZ = wz * cy + wx * sy;
      const viewY = wy * cp - yawZ * sp;
      const viewZ = wy * sp + yawZ * cp;
      if (viewZ <= 0.2) continue;

      const dist = Math.hypot(wx, wy, wz);
      const rayHit = castRay(camX, camY, camZ, wx / dist, wy / dist, wz / dist, dist - 0.2);
      if (rayHit && isSolidBlock(rayHit.block)) continue;

      const sx = RENDER_W * 0.5 + (yawX / (viewZ * tanHalfFov * aspect)) * (RENDER_W * 0.5);
      const syScreen = RENDER_H * 0.5 - (viewY / (viewZ * tanHalfFov)) * (RENDER_H * 0.5);
      if (sx < -45 || sx > RENDER_W + 45 || syScreen < -45 || syScreen > RENDER_H + 45) continue;

      drawList.push({ animal, sx, sy: syScreen, depth: viewZ });
    }

    drawList.sort((a, b) => b.depth - a.depth);
    for (const entry of drawList) {
      drawAnimal(entry.animal, entry.sx, entry.sy, entry.depth);
    }
  }

  function drawAnimal(animal, sx, sy, depth) {
    const palette = animalTypes[animal.type];
    const size = Math.max(7, Math.min(34, (26 / depth) * palette.scale));
    const bodyW = size * (animal.type === "chicken" ? 1.05 : 1.28);
    const bodyH = size * (animal.type === "chicken" ? 1.08 : 0.84);
    const headW = size * (animal.type === "chicken" ? 0.5 : 0.46);
    const headH = size * (animal.type === "chicken" ? 0.48 : 0.42);
    const bob = Math.sin(animal.stepPhase * 2.2) * (size * 0.05);
    const step = Math.sin(animal.stepPhase * 6.2) * (size * 0.08);
    const facing = Math.sin(animal.dir - player.yaw) >= 0 ? 1 : -1;

    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, bodyH * 0.54, bodyW * 0.45, Math.max(1.8, bodyH * 0.13), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(facing, 1);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = Math.max(0.6, size * 0.075);

    const legW = size * 0.14;
    const legH = size * 0.42;
    const legXs = [-bodyW * 0.34, -bodyW * 0.12, bodyW * 0.08, bodyW * 0.3];
    legXs.forEach((lx, i) => {
      const shift = i % 2 === 0 ? step : -step;
      ctx.fillStyle = palette.leg;
      ctx.fillRect(lx, bodyH * 0.28 + shift, legW, legH);
      ctx.strokeRect(lx, bodyH * 0.28 + shift, legW, legH);
    });

    if (animal.type === "pig") {
      ctx.fillStyle = palette.body;
      ctx.fillRect(-bodyW * 0.5, -bodyH * 0.48, bodyW, bodyH);
      ctx.strokeRect(-bodyW * 0.5, -bodyH * 0.48, bodyW, bodyH);

      ctx.fillStyle = palette.accent;
      ctx.fillRect(-bodyW * 0.2, -bodyH * 0.3, bodyW * 0.42, bodyH * 0.22);

      ctx.fillStyle = palette.body;
      ctx.fillRect(bodyW * 0.3, -headH * 0.52, headW, headH);
      ctx.strokeRect(bodyW * 0.3, -headH * 0.52, headW, headH);

      ctx.fillStyle = palette.snout;
      ctx.fillRect(bodyW * 0.56, -headH * 0.3, headW * 0.56, headH * 0.52);
      ctx.strokeRect(bodyW * 0.56, -headH * 0.3, headW * 0.56, headH * 0.52);

      ctx.fillStyle = palette.eye;
      ctx.fillRect(bodyW * 0.62, -headH * 0.16, size * 0.09, size * 0.09);
      ctx.fillRect(bodyW * 0.74, -headH * 0.16, size * 0.09, size * 0.09);
      ctx.fillRect(bodyW * 0.67, -headH * 0.02, size * 0.05, size * 0.05);
      ctx.fillRect(bodyW * 0.79, -headH * 0.02, size * 0.05, size * 0.05);

      ctx.beginPath();
      ctx.moveTo(bodyW * 0.38, -headH * 0.52);
      ctx.lineTo(bodyW * 0.45, -headH * 0.92);
      ctx.lineTo(bodyW * 0.52, -headH * 0.52);
      ctx.closePath();
      ctx.fillStyle = palette.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bodyW * 0.56, -headH * 0.52);
      ctx.lineTo(bodyW * 0.63, -headH * 0.92);
      ctx.lineTo(bodyW * 0.7, -headH * 0.52);
      ctx.closePath();
      ctx.fill();
    } else if (animal.type === "sheep") {
      ctx.fillStyle = palette.body;
      const clumps = [
        [-0.48, -0.48],
        [-0.24, -0.58],
        [0, -0.62],
        [0.26, -0.56],
        [0.48, -0.46],
        [-0.42, -0.2],
        [-0.14, -0.22],
        [0.18, -0.18],
        [0.42, -0.24],
      ];
      clumps.forEach(([ox, oy]) => {
        const cw = size * 0.52;
        const ch = size * 0.4;
        ctx.fillRect(ox * bodyW, oy * bodyH, cw, ch);
        ctx.strokeRect(ox * bodyW, oy * bodyH, cw, ch);
      });

      ctx.fillStyle = palette.snout;
      ctx.fillRect(bodyW * 0.34, -headH * 0.5, headW * 0.85, headH * 1.02);
      ctx.strokeRect(bodyW * 0.34, -headH * 0.5, headW * 0.85, headH * 1.02);

      ctx.fillStyle = palette.accent;
      ctx.fillRect(bodyW * 0.42, -headH * 0.37, headW * 0.66, headH * 0.52);
      ctx.fillStyle = palette.eye;
      ctx.fillRect(bodyW * 0.53, -headH * 0.14, size * 0.09, size * 0.09);

      ctx.fillStyle = palette.snout;
      ctx.fillRect(bodyW * 0.42, -headH * 0.77, size * 0.12, size * 0.18);
      ctx.fillRect(bodyW * 0.86, -headH * 0.77, size * 0.12, size * 0.18);
      ctx.strokeRect(bodyW * 0.42, -headH * 0.77, size * 0.12, size * 0.18);
      ctx.strokeRect(bodyW * 0.86, -headH * 0.77, size * 0.12, size * 0.18);
    } else {
      ctx.fillStyle = palette.body;
      ctx.fillRect(-bodyW * 0.44, -bodyH * 0.5, bodyW * 0.88, bodyH * 0.96);
      ctx.strokeRect(-bodyW * 0.44, -bodyH * 0.5, bodyW * 0.88, bodyH * 0.96);

      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(-bodyW * 0.3, -bodyH * 0.31, bodyW * 0.52, bodyH * 0.47);

      ctx.fillStyle = palette.body;
      ctx.fillRect(bodyW * 0.24, -headH * 0.58, headW * 0.86, headH * 0.94);
      ctx.strokeRect(bodyW * 0.24, -headH * 0.58, headW * 0.86, headH * 0.94);

      ctx.fillStyle = palette.snout;
      ctx.beginPath();
      ctx.moveTo(bodyW * 0.92, -headH * 0.23);
      ctx.lineTo(bodyW * 1.24, -headH * 0.02);
      ctx.lineTo(bodyW * 0.92, headH * 0.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = palette.accent;
      ctx.fillRect(bodyW * 0.52, -headH * 0.92, size * 0.11, size * 0.2);
      ctx.fillRect(bodyW * 0.64, -headH * 1.02, size * 0.11, size * 0.26);
      ctx.fillRect(bodyW * 0.76, -headH * 0.92, size * 0.11, size * 0.2);

      ctx.fillStyle = palette.eye;
      ctx.fillRect(bodyW * 0.54, -headH * 0.17, size * 0.08, size * 0.08);

      ctx.fillStyle = palette.leg;
      const clawY = bodyH * 0.7;
      ctx.fillRect(-bodyW * 0.18, clawY, size * 0.1, size * 0.19);
      ctx.fillRect(bodyW * 0.05, clawY, size * 0.1, size * 0.19);
    }

    ctx.restore();
  }

  function drawHeldItem() {
    const item = toolbarItems[selectedItem];
    if (!item || inventoryOpen || !locked) return;

    const ease = 1 - Math.pow(1 - Math.min(1, swingAnim), 3);
    const pulse = Math.sin(swingPulse * 18) * 0.04;
    const x = RENDER_W * 0.74 + ease * 14;
    const y = RENDER_H * 0.8 + ease * 12 + pulse * 8;
    const rot = 0.36 + ease * 0.95 + pulse * 0.18;
    const scale = item.type === "tool" ? 1.15 : 1.05;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);

    if (item.type === "tool" && item.tool === "pickaxe") {
      ctx.fillStyle = "#1f2328";
      ctx.fillRect(-3, -2, 6, 24);
      ctx.fillStyle = "#a37547";
      ctx.fillRect(-2, -1, 4, 24);
      ctx.fillStyle = "#adb6bf";
      ctx.beginPath();
      ctx.moveTo(-15, -8);
      ctx.lineTo(12, -11);
      ctx.lineTo(14, -5);
      ctx.lineTo(-6, -2);
      ctx.lineTo(-16, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#7d8690";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (item.type === "tool" && item.tool === "hand") {
      ctx.fillStyle = "#d5a277";
      ctx.fillRect(-10, -8, 20, 20);
      ctx.strokeStyle = "#b1805a";
      ctx.lineWidth = 1.3;
      ctx.strokeRect(-10, -8, 20, 20);
    } else {
      const palette = blockColors[item.block] || blockColors[BLOCK_STONE];
      ctx.fillStyle = `rgb(${palette.side[0]}, ${palette.side[1]}, ${palette.side[2]})`;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-10, -10, 20, 20);
    }

    ctx.restore();

    if (hitFlash > 0) {
      const alpha = Math.min(0.35, hitFlash * 0.35);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(RENDER_W * 0.5 - 2, RENDER_H * 0.5 - 2, 4, 4);
    }
  }

  function mineTargetBlock() {
    const hit = traceRayTarget(8, true);
    if (!hit) return false;

    hitFlash = 1;
    playMineSound();
    addBlockToInventory(hit.block, 1);
    setBlock(hit.x, hit.y, hit.z, BLOCK_AIR);
    refreshColumnTopSurface(hit.x, hit.z);
    snowCoverByColumn[columnIdx(hit.x, hit.z)] = 0;
    renderToolbar();
    renderInventory();
    return true;
  }

  function interact(place) {
    if (!place) {
      if (!canBreakBlocks()) return;
      mineTargetBlock();
      return;
    }

    if (selectedBlock === BLOCK_AIR) return;

    const hit = traceRayTarget(8, true);
    if (!hit || !hit.prevEmpty) return;

    const nx = hit.prevEmpty.x;
    const ny = hit.prevEmpty.y;
    const nz = hit.prevEmpty.z;

    if (!inBounds(nx, ny, nz)) return;
    if (getBlock(nx, ny, nz) !== BLOCK_AIR) return;
    if (!consumeSelectedBlock()) return;

    setBlock(nx, ny, nz, selectedBlock);
    refreshColumnTopSurface(nx, nz);
    snowCoverByColumn[columnIdx(nx, nz)] = 0;
    if (collidesAt(player.x, player.y, player.z)) {
      setBlock(nx, ny, nz, BLOCK_AIR);
      refreshColumnTopSurface(nx, nz);
      addBlockToInventory(selectedBlock, 1);
      renderToolbar();
      renderInventory();
      return;
    }
    playPlaceSound();
    renderToolbar();
    renderInventory();
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyF") {
      e.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
      return;
    }
    if (e.code === "KeyE") {
      e.preventDefault();
      toggleInventory();
      return;
    }
    if (e.code === "KeyM") {
      e.preventDefault();
      if (ambientMusicActive) {
        stopBackgroundMusic();
      } else {
        startBackgroundMusic();
      }
      return;
    }
    if (e.code === "Escape" && inventoryOpen) {
      closeInventory();
    }
    const slotCode = e.code.startsWith("Digit")
      ? e.code.slice(5)
      : e.code.startsWith("Numpad")
        ? e.code.slice(6)
        : null;
    if (slotCode !== null) {
      const idx = Number(slotCode) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < toolbarItems.length) {
        selectedItem = idx;
        if (inventoryOpen && toolbarItems[idx].type === "block") {
          inventoryTargetSlot = idx;
        }
        refreshSelectedItemState();
        renderToolbar();
        renderInventory();
      }
    }
    if (inventoryOpen) return;
    keys.add(e.code);
  });

  document.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    document.body.classList.toggle("playing", locked);
    if (locked) {
      if (pendingMineOnLock) {
        pendingMineOnLock = false;
        miningActive = true;
        miningTimer = 0;
        swingAnim = 1;
        interact(false);
      }
    } else {
      miningActive = false;
      miningTimer = 0;
      pendingMineOnLock = false;
    }
  });

  canvas.addEventListener("click", () => {
    if (inventoryOpen) return;
    ensureBackgroundMusic();
    if (!locked) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    const sensitivity = 0.0024;
    player.yaw += e.movementX * sensitivity;
    player.pitch -= e.movementY * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    if (player.pitch > lim) player.pitch = lim;
    if (player.pitch < -lim) player.pitch = -lim;
  });

  document.addEventListener("mousedown", (e) => {
    if (inventoryOpen) return;
    ensureBackgroundMusic();
    if (!locked && e.button === 0) {
      pendingMineOnLock = true;
      canvas.requestPointerLock();
      return;
    }
    if (!locked) return;
    if (e.button === 0) {
      miningActive = true;
      miningTimer = 0;
      swingAnim = 1;
      interact(false);
    }
    if (e.button === 2) interact(true);
  });

  document.addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      miningActive = false;
      miningTimer = 0;
    }
  });

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  function updateDebugText() {
    const target = traceRayTarget(8, true);
    const targetText = target ? `${target.x},${target.y},${target.z}` : "none";
    debugEl.textContent = [
      `seed ${WORLD_SEED}`,
      `x ${player.x.toFixed(2)}`,
      `y ${player.y.toFixed(2)}`,
      `z ${player.z.toFixed(2)}`,
      `fps ${fpsValue.toFixed(0)}`,
      `item ${toolbarItems[selectedItem].name}`,
      `place ${getBlockName(selectedBlock)}:${getInventoryCount(selectedBlock)}`,
      `weather ${weather.type} ${Math.ceil(Math.max(0, weather.timer))}s`,
      `snow ${getSnowCoveragePercent()}%`,
      `animals ${animals.length}`,
      `target ${targetText}`,
    ].join(" | ");
  }

  function tick(dt, forceGameplay) {
    if (locked || forceGameplay) {
      update(dt);
      if (miningActive) {
        miningTimer += dt;
        while (miningTimer >= miningInterval) {
          miningTimer -= miningInterval;
          swingAnim = 1;
          interact(false);
        }
      }
    }
    updateAnimals(dt);
    updateWeather(dt);
    swingAnim = Math.max(0, swingAnim - dt * 6);
    swingPulse += dt * (usingPickaxe() ? 1.2 : 0.85);
    hitFlash = Math.max(0, hitFlash - dt * 5.2);
  }

  function renderGameToText() {
    const target = traceRayTarget(8, true);
    return JSON.stringify({
      world_seed: WORLD_SEED,
      coordinate_system: "origin at world minimum corner; +x east, +y up, +z south",
      mode: locked ? "playing" : inventoryOpen ? "inventory" : "menu",
      player: {
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        z: Number(player.z.toFixed(2)),
        vx: Number(player.vx.toFixed(2)),
        vy: Number(player.vy.toFixed(2)),
        vz: Number(player.vz.toFixed(2)),
        yaw: Number(player.yaw.toFixed(2)),
        pitch: Number(player.pitch.toFixed(2)),
        on_ground: player.onGround,
      },
      selected: {
        item: toolbarItems[selectedItem].name,
        place_block: getBlockName(selectedBlock),
        count: getInventoryCount(selectedBlock),
      },
      animals: animals.map((animal) => ({
        type: animal.type,
        x: Number(animal.x.toFixed(2)),
        y: Number(animal.y.toFixed(2)),
        z: Number(animal.z.toFixed(2)),
      })),
      weather: {
        type: weather.type,
        seconds_remaining: Number(Math.max(0, weather.timer).toFixed(1)),
        snow_cover_percent: getSnowCoveragePercent(),
      },
      target: target
        ? { x: target.x, y: target.y, z: target.z, block: getBlockName(target.block) }
        : null,
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    const dt = ms / 1000 / steps;
    for (let i = 0; i < steps; i++) {
      tick(dt, true);
    }
    fpsValue = dt > 0 ? 1 / dt : fpsValue;
    render();
    updateDebugText();
  };

  let prev = performance.now();
  function frame(t) {
    const dt = Math.min(0.033, (t - prev) / 1000);
    prev = t;

    tick(dt, false);
    fpsValue = dt > 0 ? 1 / dt : fpsValue;
    render();
    updateDebugText();

    requestAnimationFrame(frame);
  }

  generateWorld();
  rebuildColumnTopSurfaceCache();
  setWeather(WEATHER_SUNNY);
  spawnAnimals();
  refreshSelectedItemState();
  renderToolbar();

  while (collidesAt(player.x, player.y, player.z) && player.y < WORLD_Y - 2) {
    player.y += 1;
  }

  overlay.addEventListener("click", () => {
    ensureBackgroundMusic();
    canvas.requestPointerLock();
  });

  requestAnimationFrame(frame);
})();
