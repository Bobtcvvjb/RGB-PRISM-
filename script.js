// --- constants ---
const TILE_SIZE = 16;
const ROOM_WIDTH = 16;
const ROOM_HEIGHT = 11;
const SCREEN_WIDTH = ROOM_WIDTH * TILE_SIZE;
const SCREEN_HEIGHT = ROOM_HEIGHT * TILE_SIZE;

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
function roomFromAscii(lines) {
    const tiles = [];
    for (let y = 0; y < ROOM_HEIGHT; y++) {
        for (let x = 0; x < ROOM_WIDTH; x++) {
            tiles.push(lines[y][x] === "#" ? 1 : 0);
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

// --- automatic room templates ---
const ROOM_TEMPLATES = [
    [
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
    ],
    [
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
    ],
    [
        "################",
        "#..##..........#",
        "#..##..........#",
        "#..............#",
        "#......####....#",
        "#..............#",
        "#..........##..#",
        "#..........##..#",
        "#..............#",
        "#..............#",
        "################"
    ]
];

function getRandomTemplate() {
    return ROOM_TEMPLATES[Math.floor(Math.random() * ROOM_TEMPLATES.length)];
}

// --- collision ---
let collisionMap = new Array(ROOM_WIDTH * ROOM_HEIGHT).fill(0);

function buildCollisionMap(room) {
    const map = [];
    for (let i = 0; i < room.tiles.length; i++) {
        map[i] = room.tiles[i] === 1 ? 1 : 0;
    }
    return map;
}

function isSolidPixel(px, py) {
    if (px < 0 || py < 0 || px >= SCREEN_WIDTH || py >= SCREEN_HEIGHT) return true;
    const cx = Math.floor(px / TILE_SIZE);
    const cy = Math.floor(py / TILE_SIZE);
    return collisionMap[cy * ROOM_WIDTH + cx] === 1;
}

// --- player (11×11) ---
const player = {
    x: SCREEN_WIDTH / 2 - 6,
    y: SCREEN_HEIGHT / 2 - 6,
    w: 11,
    h: 11,
    dir: "down",
    speed: 1,
    sword: { active:false, timer:0, maxTime:10 }
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
}

// --- sword ---
function getSwordBox() {
    const size = 8;
    let sx = player.x;
    let sy = player.y;

    if (player.dir === "up") sy -= size;
    if (player.dir === "down") sy += player.h;
    if (player.dir === "left") sx -= size;
    if (player.dir === "right") sx += player.w;

    return { x:sx, y:sy, w:size, h:size };
}

function aabbOverlap(a, b) {
    return !(
        a.x + a.w <= b.x ||
        a.x >= b.x + b.w ||
        a.y + a.h <= b.y ||
        a.y >= b.y + b.h
    );
}

// --- transition lock ---
let transitioning = false;
let transitionTimer = 0;
const TRANSITION_TIME = 20;

// --- player update ---
function updatePlayer() {
    if (transitioning) return;

    let dx = 0, dy = 0;

    if (input.up) { dy = -player.speed; player.dir = "up"; }
    if (input.down) { dy = player.speed; player.dir = "down"; }
    if (input.left) { dx = -player.speed; player.dir = "left"; }
    if (input.right) { dx = player.speed; player.dir = "right"; }

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

    checkRoomExit();
}

// --- exit logic (only through '.' tiles) ---
function checkRoomExit() {
    // LEFT
    if (player.x < 0) {
        const tileY = Math.floor(player.y / TILE_SIZE);
        if (currentRoom.tiles[tileY * ROOM_WIDTH + 0] === 0)
            changeRoom(-1, 0);
        else player.x = 0;
    }

    // RIGHT
    if (player.x + player.w > SCREEN_WIDTH) {
        const tileY = Math.floor(player.y / TILE_SIZE);
        if (currentRoom.tiles[tileY * ROOM_WIDTH + (ROOM_WIDTH - 1)] === 0)
            changeRoom(1, 0);
        else player.x = SCREEN_WIDTH - player.w;
    }

    // TOP
    if (player.y < 0) {
        const tileX = Math.floor(player.x / TILE_SIZE);
        if (currentRoom.tiles[tileX] === 0)
            changeRoom(0, -1);
        else player.y = 0;
    }

    // BOTTOM
    if (player.y + player.h > SCREEN_HEIGHT) {
        const tileX = Math.floor(player.x / TILE_SIZE);
        if (currentRoom.tiles[(ROOM_HEIGHT - 1) * ROOM_WIDTH + tileX] === 0)
            changeRoom(0, 1);
        else player.y = SCREEN_HEIGHT - player.h;
    }
}

// --- room loading ---
function loadRoom(x, y) {
    const key = `${x},${y}`;
    currentRoom = rooms[key];
    enemies = JSON.parse(JSON.stringify(currentRoom.enemies));
    collisionMap = buildCollisionMap(currentRoom);
}

// --- room changing ---
function changeRoom(dx, dy) {
    if (transitioning) return;

    const newX = roomX + dx;
    const newY = roomY + dy;
    const key = `${newX},${newY}`;

    // auto-generate room if missing
    if (!rooms[key]) {
        const template = getRandomTemplate();
        createRoom(newX, newY, template);
    }

    transitioning = true;
    transitionTimer = TRANSITION_TIME;

    roomX = newX;
    roomY = newY;

    loadRoom(roomX, roomY);

    if (dx < 0) player.x = SCREEN_WIDTH - player.w - 2;
    if (dx > 0) player.x = 2;
    if (dy < 0) player.y = SCREEN_HEIGHT - player.h - 2;
    if (dy > 0) player.y = 2;
}

// --- enemies ---
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

        if (!isSolidPixel(e.x + dx, e.y)) e.x += dx;
        if (!isSolidPixel(e.x, e.y + dy)) e.y += dy;

        if (player.sword.active && aabbOverlap(getSwordBox(), e)) {
            e.x = -9999;
            e.y = -9999;
        }
    }
}

// --- background ---
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

// --- sprite render ---
function drawSpritesNES() {
    for (let s of sprites) {
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.w, s.h);
    }
}

// --- main loop ---
function update() {
    if (transitioning) {
        transitionTimer--;
        if (transitionTimer <= 0) transitioning = false;
    }

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

// --- starting room ---
createRoom(0, 0, [
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    "#....####......#",
    "#..............#",
    "#..............#",
    "#......####....#",
    "#..............#",
    "#..............#",
    "################"
]);

loadRoom(0, 0);
gameLoop();
