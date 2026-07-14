// --- constants ---
const TILE_SIZE = 16;
const ROOM_WIDTH = 16;   // tiles
const ROOM_HEIGHT = 11;  // tiles
const SCREEN_WIDTH = ROOM_WIDTH * TILE_SIZE;   // 256
const SCREEN_HEIGHT = ROOM_HEIGHT * TILE_SIZE; // 176

// --- canvas ---
const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");

// --- input ---
const input = { up:false, down:false, left:false, right:false, attack:false };

window.addEventListener("keydown", e => {
    if (e.key === "ArrowUp") input.up = true;
    if (e.key === "ArrowDown") input.down = true;
    if (e.key === "ArrowLeft") input.left = true;
    if (e.key === "ArrowRight") input.right = true;
    if (e.key === "z") input.attack = true;
});

window.addEventListener("keyup", e => {
    if (e.key === "ArrowUp") input.up = false;
    if (e.key === "ArrowDown") input.down = false;
    if (e.key === "ArrowLeft") input.left = false;
    if (e.key === "ArrowRight") input.right = false;
    if (e.key === "z") input.attack = false;
});

// --- colors ---
const COLORS = {
    bg: "#000000",
    solid: "#305080",
    player: "#f8f8f8",
    enemy: "#e06060",
    sword: "#f0f000"
};

// --- room storage ---
let rooms = {};
let roomX = 0;
let roomY = 0;
let currentRoom = null;

// --- ASCII room helper ---
// '#' = solid, '.' = empty
function roomFromAscii(lines) {
    if (lines.length !== ROOM_HEIGHT)
        throw new Error("Room must have " + ROOM_HEIGHT + " lines");
    const tiles = [];
    for (let y = 0; y < ROOM_HEIGHT; y++) {
        const line = lines[y];
        if (line.length !== ROOM_WIDTH)
            throw new Error("Line " + y + " must have " + ROOM_WIDTH + " chars");
        for (let x = 0; x < ROOM_WIDTH; x++) {
            const ch = line[x];
            tiles.push(ch === "#" ? 1 : 0);
        }
    }
    return tiles;
}

function createRoom(x, y, asciiLines, enemies = []) {
    rooms[`${x},${y}`] = {
        tiles: roomFromAscii(asciiLines),
        enemies: enemies
    };
}

// --- collision ---
const COLLISION_TILE_SIZE = 16;
const COLLISION_WIDTH = ROOM_WIDTH;
const COLLISION_HEIGHT = ROOM_HEIGHT;
let collisionMap = new Array(COLLISION_WIDTH * COLLISION_HEIGHT).fill(0);

function buildCollisionMap(room) {
    const map = new Array(COLLISION_WIDTH * COLLISION_HEIGHT).fill(0);
    for (let y = 0; y < ROOM_HEIGHT; y++) {
        for (let x = 0; x < ROOM_WIDTH; x++) {
            const idx = y * ROOM_WIDTH + x;
            map[idx] = room.tiles[idx] === 1 ? 1 : 0;
        }
    }
    return map;
}

function isSolidPixel(px, py) {
    if (px < 0 || py < 0 || px >= SCREEN_WIDTH || py >= SCREEN_HEIGHT) return true;
    const cx = Math.floor(px / COLLISION_TILE_SIZE);
    const cy = Math.floor(py / COLLISION_TILE_SIZE);
    const idx = cy * COLLISION_WIDTH + cx;
    return collisionMap[idx] === 1;
}

// --- player ---
const player = {
    x: SCREEN_WIDTH / 2 - 4,
    y: SCREEN_HEIGHT / 2 - 4,
    w: 8,
    h: 8,
    dir: "down",
    speed: 1,
    sword: {
        active: false,
        timer: 0,
        maxTime: 10
    }
};

// --- enemies ---
let enemies = [];

// --- sprites ---
let sprites = [];

function buildSprites() {
    sprites = [];
    sprites.push({ x: player.x, y: player.y, w: player.w, h: player.h, color: COLORS.player });
    for (let e of enemies) {
        sprites.push({ x: e.x, y: e.y, w: e.w, h: e.h, color: COLORS.enemy });
    }
    if (player.sword.active) {
        const s = getSwordBox();
        sprites.push({ x: s.x, y: s.y, w: s.w, h: s.h, color: COLORS.sword });
    }
    if (sprites.length > 64) sprites.length = 64;
}

// --- sword / collision ---
function getSwordBox() {
    const size = 8;
    let sx = player.x;
    let sy = player.y;
    if (player.dir === "up") sy -= size;
    if (player.dir === "down") sy += player.h;
    if (player.dir === "left") sx -= size;
    if (player.dir === "right") sx += player.w;
    return { x: sx, y: sy, w: size, h: size };
}

function aabbOverlap(a, b) {
    return !(
        a.x + a.w <= b.x ||
        a.x >= b.x + b.w ||
        a.y + a.h <= b.y ||
        a.y >= b.y + b.h
    );
}

// --- player update ---
function updatePlayer() {
    let dx = 0, dy = 0;

    if (input.up) { dy = -player.speed; player.dir = "up"; }
    else if (input.down) { dy = player.speed; player.dir = "down"; }
    else if (input.left) { dx = -player.speed; player.dir = "left"; }
    else if (input.right) { dx = player.speed; player.dir = "right"; }

    if (!isSolidPixel(player.x + dx, player.y) &&
        !isSolidPixel(player.x + dx + player.w - 1, player.y + player.h - 1)) {
        player.x += dx;
    }
    if (!isSolidPixel(player.x, player.y + dy) &&
        !isSolidPixel(player.x + player.w - 1, player.y + dy + player.h - 1)) {
        player.y += dy;
    }

    if (!player.sword.active && input.attack) {
        player.sword.active = true;
        player.sword.timer = player.sword.maxTime;
    }
    if (player.sword.active) {
        player.sword.timer--;
        if (player.sword.timer <= 0) player.sword.active = false;
    }

    if (player.x < 0) changeRoom(-1, 0);
    if (player.x + player.w > SCREEN_WIDTH) changeRoom(1, 0);
    if (player.y < 0) changeRoom(0, -1);
    if (player.y + player.h > SCREEN_HEIGHT) changeRoom(0, 1);
}

// --- enemies update ---
function updateEnemies() {
    for (let e of enemies) {
        e.timer--;
        if (e.timer <= 0) {
            e.timer = 30 + Math.floor(Math.random() * 60);
            const dirs = ["up","down","left","right"];
            e.dir = dirs[Math.floor(Math.random() * dirs.length)];
        }

        let dx = 0, dy = 0;
        if (e.dir === "up") dy = -e.speed;
        if (e.dir === "down") dy = e.speed;
        if (e.dir === "left") dx = -e.speed;
        if (e.dir === "right") dx = e.speed;

        if (!isSolidPixel(e.x + dx, e.y) &&
            !isSolidPixel(e.x + dx + e.w - 1, e.y + e.h - 1)) {
            e.x += dx;
        }
        if (!isSolidPixel(e.x, e.y + dy) &&
            !isSolidPixel(e.x + e.w - 1, e.y + dy + e.h - 1)) {
            e.y += dy;
        }

        if (player.sword.active) {
            const swordBox = getSwordBox();
            if (aabbOverlap(swordBox, e)) {
                e.x = -1000;
                e.y = -1000;
            }
        }
    }
}

// --- room loading / changing ---
function loadRoom(x, y) {
    const key = `${x},${y}`;
    if (!rooms[key]) {
        console.warn("Room not found:", key);
        currentRoom = {
            tiles: new Array(ROOM_WIDTH * ROOM_HEIGHT).fill(0),
            enemies: []
        };
    } else {
        currentRoom = rooms[key];
    }
    enemies = JSON.parse(JSON.stringify(currentRoom.enemies));
    collisionMap = buildCollisionMap(currentRoom);
}

function changeRoom(dx, dy) {
    roomX += dx;
    roomY += dy;
    loadRoom(roomX, roomY);

    if (dx < 0) player.x = SCREEN_WIDTH - player.w - 1;
    if (dx > 0) player.x = 1;
    if (dy < 0) player.y = SCREEN_HEIGHT - player.h - 1;
    if (dy > 0) player.y = 1;
}

// --- background render ---
function drawBackground() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    for (let y = 0; y < ROOM_HEIGHT; y++) {
        for (let x = 0; x < ROOM_WIDTH; x++) {
            const idx = y * ROOM_WIDTH + x;
            if (currentRoom.tiles[idx] === 1) {
                ctx.fillStyle = COLORS.solid;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

// --- sprite render with simple NES-like limit ---
function drawSpritesNES() {
    for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i];
        let countOnScanline = 0;
        for (let j = 0; j < sprites.length; j++) {
            const o = sprites[j];
            if (o.y <= s.y && o.y + o.h > s.y) countOnScanline++;
        }
        if (countOnScanline > 8 && i % 2 === 0) continue;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.w, s.h);
    }
}

// --- main loop ---
function update() {
    updatePlayer();
    updateEnemies();
    buildSprites();
}

function render() {
    drawBackground();
    drawSpritesNES();
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// --- define rooms using ASCII helper ---
createRoom(0, 0, [
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "################"
]);

createRoom(1, 0, [
    "################",
    "#......####....#",
    "#..............#",
    "#..............#",
    "#....####......#",
    "#..............#",
    "#..............#",
    "#......####....#",
    "#..............#",
    "#..............#",
    "################"
], [
    { x: 80, y: 80, w: 8, h: 8, dir: "left", speed: 1, state: "walk", timer: 60 }
]);

// --- start ---
loadRoom(0, 0);
gameLoop();
