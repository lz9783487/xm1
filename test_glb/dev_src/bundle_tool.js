const fs = require('fs');
const path = require('path');

const GLB_FILE = 'Untitled4.glb';
const HTML_TEMPLATE = 'interactive_mapper.html';
const OUTPUT_FILE = 'standalone_mapper.html';

const TEXTURES = [
    "textures/split4_qian.png",
    "textures/split4_you.png",
    "textures/split4_zuo.png",
    "textures/split4_xia.png",
    "textures/floor.png",
    "textures/wall_front.png",
    "textures/wall_back.png",
    "textures/wall_left.png",
    "textures/wall_right.png"
];

function toBase64(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const bitmap = fs.readFileSync(filePath);
    const mime = filePath.endsWith('.png') ? 'image/png' : 'model/gltf-binary';
    return `data:${mime};base64,${bitmap.toString('base64')}`;
}

const glbBase64 = toBase64(GLB_FILE);
const textureMap = {};

TEXTURES.forEach(tex => {
    textureMap[tex] = toBase64(tex);
});

let html = fs.readFileSync(HTML_TEMPLATE, 'utf8');

// Inject GLB
html = html.replace('BABYLON.SceneLoader.ImportMeshAsync("", "./", "Untitled4.glb", scene)',
    `BABYLON.SceneLoader.ImportMeshAsync("", "", "${glbBase64}", scene)`
);

// Inject Textures
// Find the original TEXTURES array literal and replace contents with Base64s
// But simpler: just inject a dictionary and modify the code.

const textureInjections = `
const TEXTURE_DATA = ${JSON.stringify(textureMap)};
const TEXTURES = Object.keys(TEXTURE_DATA);
`;

// Replace lines declaring TEXTURES array
html = html.replace(/const TEXTURES = \[[^\]]*\];/s, textureInjections);

// Replace texture loading logic
html = html.replace(
    'const tex = new BABYLON.Texture(texPath, scene);',
    'const tex = new BABYLON.Texture(TEXTURE_DATA[texPath] || texPath, scene);'
);

// Also update the dropdowns logic if needed, but since keys are same paths, it should work.

fs.writeFileSync(OUTPUT_FILE, html);
console.log(`Created ${OUTPUT_FILE}`);
