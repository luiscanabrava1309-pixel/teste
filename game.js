// Flight Simulator Game
// Real satellite world with lightweight 3D rendering

const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowShadowMap;

// Sky and atmosphere
const skyGeometry = new THREE.SphereGeometry(80000, 32, 32);
const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x87CEEB) },
        bottomColor: { value: new THREE.Color(0xE0F6FF) },
        offset: { value: 400 },
        exponent: { value: 0.6 }
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize(vWorldPosition + offset).y;
            gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
    `,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// Lighting
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(5000, 10000, 7000);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.left = -50000;
sunLight.shadow.camera.right = 50000;
sunLight.shadow.camera.top = 50000;
sunLight.shadow.camera.bottom = -50000;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 50000;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Game state
const gameState = {
    position: new THREE.Vector3(0, 2000, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    speed: 0,
    altitude: 2000,
    fuel: 100,
    isEngineOn: true,
    worldOffset: new THREE.Vector2(0, 0),
    currentLocationIndex: 0
};

// Real world locations (latitude, longitude)
const worldLocations = [
    { name: 'San Francisco, USA', lat: 37.7749, lon: -122.4194 },
    { name: 'New York, USA', lat: 40.7128, lon: -74.0060 },
    { name: 'Paris, France', lat: 48.8566, lon: 2.3522 },
    { name: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503 },
    { name: 'Sydney, Australia', lat: -33.8688, lon: 151.2093 },
    { name: 'Rio de Janeiro, Brazil', lat: -22.9068, lon: -43.1729 },
    { name: 'Dubai, UAE', lat: 25.2048, lon: 55.2708 },
    { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
    { name: 'London, UK', lat: 51.5074, lon: -0.1278 },
    { name: 'Barcelona, Spain', lat: 41.3851, lon: 2.1734 }
];

let currentLocation = worldLocations[0];

// Terrain generation
class TerrainManager {
    constructor() {
        this.terrainChunks = new Map();
        this.chunkSize = 5000;
        this.maxChunksLoaded = 9;
    }

    getChunkKey(x, z) {
        return `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    }

    generateTerrainChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.terrainChunks.has(key)) return this.terrainChunks.get(key);

        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;

        // Create heightmap
        const geometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, 32, 32);
        const positions = geometry.attributes.position.array;

        // Improved noise-based terrain generation
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i] + worldX;
            const z = positions[i + 2] + worldZ;
            const y = this.getHeightAtPosition(x, z);
            positions[i + 1] = y;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // Create satellite imagery texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Simulate satellite imagery with procedural generation
        const imageData = ctx.createImageData(256, 256);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            const px = idx % 256;
            const py = Math.floor(idx / 256);
            const noiseVal = Math.sin(px * 0.02) * Math.sin(py * 0.02) * 0.5 + 0.5;
            const grassColor = Math.random() > 0.7 ? 80 : 100;
            data[i] = grassColor + noiseVal * 50;     // R
            data[i + 1] = 140 + noiseVal * 30;         // G
            data[i + 2] = grassColor * 0.7 + noiseVal * 20; // B
            data[i + 3] = 255;                         // A
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;

        const material = new THREE.MeshLambertMaterial({ map: texture });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.position.set(worldX + this.chunkSize / 2, 0, worldZ + this.chunkSize / 2);
        scene.add(mesh);

        this.terrainChunks.set(key, mesh);
        return mesh;
    }

    getHeightAtPosition(x, z) {
        // Combine multiple noise layers for varied terrain
        const scale1 = 0.001;
        const scale2 = 0.005;
        const scale3 = 0.02;

        const noise1 = Math.sin(x * scale1) * Math.cos(z * scale1) * 300;
        const noise2 = Math.sin(x * scale2) * Math.cos(z * scale2) * 100;
        const noise3 = Math.sin(x * scale3) * Math.cos(z * scale3) * 50;

        return Math.max(0, noise1 + noise2 + noise3 + 100);
    }

    updateLoadedChunks(playerPos) {
        const playerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const playerChunkZ = Math.floor(playerPos.z / this.chunkSize);

        // Load chunks around player
        for (let x = playerChunkX - 1; x <= playerChunkX + 1; x++) {
            for (let z = playerChunkZ - 1; z <= playerChunkZ + 1; z++) {
                this.generateTerrainChunk(x, z);
            }
        }

        // Unload distant chunks
        for (const [key, mesh] of this.terrainChunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (Math.abs(cx - playerChunkX) > 2 || Math.abs(cz - playerChunkZ) > 2) {
                scene.remove(mesh);
                this.terrainChunks.delete(key);
            }
        }
    }
}

const terrainManager = new TerrainManager();

// Cloud particles
function createClouds() {
    const cloudGeometry = new THREE.BufferGeometry();
    const cloudCount = 200;
    const positions = new Float32Array(cloudCount * 3);

    for (let i = 0; i < cloudCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 60000;
        positions[i * 3 + 1] = 3000 + Math.random() * 3000;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60000;
    }

    cloudGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const cloudMaterial = new THREE.PointsMaterial({ size: 150, color: 0xffffff, transparent: true, opacity: 0.6 });
    return new THREE.Points(cloudGeometry, cloudMaterial);
}

const clouds = createClouds();
scene.add(clouds);

// Input handling
const keys = {};
const mouse = { x: 0, y: 0, locked: false };

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'r') {
        gameState.position.y = 2000;
        gameState.velocity.y = 0;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

window.addEventListener('mousemove', (e) => {
    if (mouse.locked) {
        mouse.x += e.movementX * 0.001;
        mouse.y += e.movementY * 0.001;
        mouse.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouse.y));
    }
});

window.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
});

function togglePointerLock() {
    if (mouse.locked) {
        document.exitPointerLock();
    } else {
        canvas.requestPointerLock();
    }
}

// World location changing
function changeLocation() {
    gameState.currentLocationIndex = (gameState.currentLocationIndex + 1) % worldLocations.length;
    currentLocation = worldLocations[gameState.currentLocationIndex];
    gameState.position.set(0, 2000, 0);
    gameState.velocity.set(0, 0, 0);
}

window.changeLocation = changeLocation;
window.togglePointerLock = togglePointerLock;

// Update game state
function update(deltaTime) {
    // Movement input
    const moveDirection = new THREE.Vector3();
    const moveSpeed = 100;

    if (keys['w']) moveDirection.z -= 1;
    if (keys['s']) moveDirection.z += 1;
    if (keys['a']) moveDirection.x -= 1;
    if (keys['d']) moveDirection.x += 1;
    if (keys[' ']) gameState.velocity.y += 50;
    if (keys['c']) gameState.velocity.y -= 50;
    if (keys['q']) gameState.rotation.z += 0.05;
    if (keys['e']) gameState.rotation.z -= 0.05;

    moveDirection.normalize();
    moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), gameState.rotation.y);
    moveDirection.multiplyScalar(moveSpeed);

    gameState.velocity.x = moveDirection.x;
    gameState.velocity.z = moveDirection.z;

    // Physics
    gameState.velocity.y -= 50 * deltaTime; // Gravity
    gameState.position.add(gameState.velocity.clone().multiplyScalar(deltaTime));

    // Ground collision
    const groundHeight = terrainManager.getHeightAtPosition(gameState.position.x, gameState.position.z);
    if (gameState.position.y < groundHeight + 50) {
        gameState.position.y = groundHeight + 50;
        gameState.velocity.y = 0;
    }

    // Camera follow
    camera.position.copy(gameState.position);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = gameState.rotation.y;
    camera.rotation.x = gameState.rotation.x;
    camera.rotation.z = gameState.rotation.z;

    // Update rotation based on mouse
    gameState.rotation.y = mouse.x;
    gameState.rotation.x = mouse.y;

    // Update terrain
    terrainManager.updateLoadedChunks(gameState.position);

    // Update clouds
    clouds.position.copy(gameState.position);

    // Fuel consumption
    if (gameState.isEngineOn) {
        gameState.fuel = Math.max(0, gameState.fuel - 0.01);
        if (gameState.fuel === 0) gameState.isEngineOn = false;
    }

    // Update HUD
    gameState.speed = gameState.velocity.length();
    gameState.altitude = gameState.position.y;
    updateHUD();
}

function updateHUD() {
    document.getElementById('altitude').textContent = Math.floor(gameState.altitude);
    document.getElementById('speed').textContent = Math.floor(gameState.speed);
    document.getElementById('heading').textContent = Math.floor((gameState.rotation.y * 180 / Math.PI + 360) % 360);
    document.getElementById('pitch').textContent = Math.floor(gameState.rotation.x * 180 / Math.PI);
    document.getElementById('roll').textContent = Math.floor(gameState.rotation.z * 180 / Math.PI);
    document.getElementById('climb').textContent = Math.floor(gameState.velocity.y);
    
    document.getElementById('latitude').textContent = (currentLocation.lat + gameState.position.x / 100000).toFixed(4);
    document.getElementById('longitude').textContent = (currentLocation.lon + gameState.position.z / 100000).toFixed(4);
    document.getElementById('fuel').textContent = Math.floor(gameState.fuel);
    document.getElementById('engine').textContent = gameState.isEngineOn ? 'ON' : 'OFF';
    document.getElementById('location-info').textContent = `📍 ${currentLocation.name} | Terrain: Dynamic Procedural World`;

    const warningMsg = document.getElementById('warning-msg');
    if (gameState.altitude < 200) {
        warningMsg.innerHTML = '<span class="danger">⚠️ LOW ALTITUDE - PULL UP!</span>';
    } else if (gameState.fuel < 20) {
        warningMsg.innerHTML = '<span class="warning">⚠️ LOW FUEL</span>';
    } else {
        warningMsg.innerHTML = '';
    }
}

// Animation loop
let lastTime = Date.now();
function animate() {
    requestAnimationFrame(animate);

    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    update(deltaTime);
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start game
animate();
updateHUD();