const fs = require('fs');
const path = require('path');

const GLB_FILE = 'Untitled4.glb';
const VIDEO_TOOL_PATH = '../video_3d_live.html';
const OUTPUT_FILE = 'video_mapper.html';

// 1. Read Resources
if (!fs.existsSync(GLB_FILE)) {
    console.error("GLB file not found!");
    process.exit(1);
}
const glbBuffer = fs.readFileSync(GLB_FILE);
const glbBase64 = `data:model/gltf-binary;base64,${glbBuffer.toString('base64')}`;

let html = fs.readFileSync(VIDEO_TOOL_PATH, 'utf8');

// 2. Modify HTML Head
// Remove Three.js imports
html = html.replace(/<script type="importmap">.*?<\/script>/s, '');
html = html.replace(/import \* as THREE.*?GLTFExporter\.js';/s, '');

// Inject Babylon.js
const babylonScripts = `
    <script src="https://cdn.babylonjs.com/babylon.js"></script>
    <script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
`;
html = html.replace('</title>', '</title>' + babylonScripts);

// 3. Logic Replacement using Brace Counting
function replaceFunction(source, funcName, newContent) {
    const startMarker = `function ${funcName}() {`;
    const startIndex = source.indexOf(startMarker);
    if (startIndex === -1) {
        console.warn(`Function ${funcName} not found, appending.`);
        return source + '\n' + newContent;
    }

    let openCount = 0;
    let endIndex = -1;
    let foundStart = false;

    for (let i = startIndex; i < source.length; i++) {
        if (source[i] === '{') {
            openCount++;
            foundStart = true;
        } else if (source[i] === '}') {
            openCount--;
        }

        if (foundStart && openCount === 0) {
            endIndex = i + 1;
            break;
        }
    }

    if (endIndex !== -1) {
        // Replace the function body
        return source.substring(0, startIndex) + newContent + source.substring(endIndex);
    } else {
        console.error(`Could not find closing brace for ${funcName}`);
        return source;
    }
}

const fixedBabylonScript = `
        // ===== Babylon.js =====
        let engine = null;
        
        async function init3D() {
            if (engine) return; // Already init
            
            const bCanvas = document.createElement('canvas');
            bCanvas.style.width = '100%';
            bCanvas.style.height = '100%';
            bCanvas.style.touchAction = 'none';
            bCanvas.id = 'babylonCanvas';
            document.getElementById('view3D').innerHTML = '';
            document.getElementById('view3D').appendChild(bCanvas);
            
            engine = new BABYLON.Engine(bCanvas, true);
            
            scene = new BABYLON.Scene(engine);
            scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);
            
            // Camera
            camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 0, 0), scene);
            camera.attachControl(bCanvas, true);
            camera.wheelPrecision = 50;
            
            // Light
            const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 0), scene);
            light.intensity = 1.2;

            // Load GLB
            try {
                const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", "${glbBase64}", scene);
                const root = result.meshes[0];
                root.normalizeToUnitCube();
                room = root; 
                
                // Map Materials
                mats = {};
                mats['left'] = scene.getMaterialByName('Material.001');
                mats['back'] = scene.getMaterialByName('Material.002');
                mats['right'] = scene.getMaterialByName('Material.003');
                mats['floor'] = scene.getMaterialByName('Material.005');

                // Debug: Log materials if some are missing
                if (!mats['left']) console.warn('Material.001 (left) not found');
                if (!mats['back']) console.warn('Material.002 (back) not found');
                if (!mats['right']) console.warn('Material.003 (right) not found');
                if (!mats['floor']) console.warn('Material.005 (floor) not found');
                
                threeInit = true; 
                updateMats(); 
                
            } catch(e) { console.error(e); }
            
            window.addEventListener('resize', () => engine.resize());
            new ResizeObserver(() => engine.resize()).observe(bCanvas);
        }
`;

// Replace init3D
html = replaceFunction(html, 'init3D', fixedBabylonScript);

// Replace mainLoop
const newMainLoop = `
        function mainLoop() {
            requestAnimationFrame(mainLoop);

            if (isVid && playing) {
                updateProgress();
            }

            // Always update textures in 3D mode (or even 2D if needed for debug)
            if (mode !== '2d') {
                genTextures();
                if (playing || threeInit) updateMats();
            }

            if (mode === '2d') {
                if (playing || !isVid) render2D();
            } else {
                if (engine && threeInit) {
                    scene.render();
                }
            }
        }
`;
html = replaceFunction(html, 'mainLoop', newMainLoop);

// Replace updateMats with UI-aware version
const newUpdateMats = `
function updateMats() {
    if (!threeInit) return;

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || 0 : 0;
    };
    const getCheck = (id) => {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    };

    const apply = (key, mat, suffix) => {
        if (!mat) return;
        const cvs = texCvs[key];

        if (!mat.albedoTexture || mat.albedoTexture.name !== key) {
            const tex = new BABYLON.DynamicTexture(key, cvs, scene, false);
            tex.hasAlpha = false;
            // FIX: Set rotation/scale center to middle
            tex.uRotationCenter = 0.5;
            tex.vRotationCenter = 0.5;

            mat.albedoTexture = tex;
            mat.albedoColor = new BABYLON.Color3(1, 1, 1);
            mat.roughness = 1.0; mat.metallic = 0.0;
        }

        const tex = mat.albedoTexture;
        const ctx = tex.getContext();
        ctx.drawImage(cvs, 0, 0, cvs.width, cvs.height, 0, 0, tex.getSize().width, tex.getSize().height);
        tex.update();

        // Read UI values
        const rotDeg = getVal('c' + suffix + 'R');
        const scaleU = getVal('c' + suffix + 'SU');
        const scaleV = getVal('c' + suffix + 'SV');
        const mirror = getCheck('c' + suffix + 'X');
        const flip = getCheck('c' + suffix + 'Y');

        // Transforms
        // Rotation (Degrees to Radians)
        tex.wAng = -rotDeg * Math.PI / 180;

        // Scale + Mirror/Flip
        // If mirrored, negate scale. 
        // Default scaleU/scaleV is 1.
        tex.uScale = (mirror ? -1 : 1) * (scaleU || 1);
        tex.vScale = (flip ? -1 : 1) * (scaleV || 1);
    };

    apply('back', mats['back'], 'B');
    apply('left', mats['left'], 'L');
    apply('right', mats['right'], 'R');
    apply('floor', mats['floor'], 'F');
}
`;

html = replaceFunction(html, 'updateMats', newUpdateMats);

// Disable buildRoom
html = replaceFunction(html, 'buildRoom', 'function buildRoom() {}');

// 4. Inject Advanced Texture Controls
// Helper to generate controls for a face
const getFaceControls = (key, label) => `
    <div class="box-3d">
        <h5>${label}</h5>
        <div class="row-3d">
            <span>Rot(°)</span><input type="number" id="c${key}R" value="${key === 'B' || key === 'R' || key === 'F' ? 270 : 0}" step="90" style="width:50px">
        </div>
        <div class="row-3d">
            <span>Scale</span>
            <input type="number" id="c${key}SU" value="1" step="0.1" style="width:40px" placeholder="U">
            <input type="number" id="c${key}SV" value="1" step="0.1" style="width:40px" placeholder="V">
        </div>
        <div class="row-3d"><span>镜像</span><input type="checkbox" id="c${key}X" ${key !== 'L' ? 'checked' : ''}></div>
        <div class="row-3d"><span>翻转</span><input type="checkbox" id="c${key}Y"></div>
    </div>
`;

// Back
html = html.replace(/<div class="box-3d">[\s\S]*?<h5>后墙<\/h5>[\s\S]*?<\/div>/, getFaceControls('B', '后墙'));
// Left
html = html.replace(/<div class="box-3d">[\s\S]*?<h5>左墙<\/h5>[\s\S]*?<\/div>/, getFaceControls('L', '左墙'));
// Right
html = html.replace(/<div class="box-3d">[\s\S]*?<h5>右墙<\/h5>[\s\S]*?<\/div>/, getFaceControls('R', '右墙'));
// Floor
html = html.replace(/<div class="box-3d">[\s\S]*?<h5>地面<\/h5>[\s\S]*?<\/div>/, getFaceControls('F', '地面'));


// 4. Inject Regex Replacements for Tab and Checkboxes

// Fix Tab Logic to include resize
const tabRegex = /document\.querySelectorAll\('\.tab'\)\.forEach\(tab => \{[\s\S]*?\}\);\s*/s;
const newTabCode = `
        // Fixed Tab Logic with Resize
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                mode = tab.dataset.v;
                view2D.style.display = mode === '2d' ? 'block' : 'none';
                view3D.style.display = mode === '3d' ? 'block' : 'none';
                document.getElementById('sec3D').style.display = mode === '3d' ? 'block' : 'none';
                updateHandles();
                if (mode === '3d') {
                    // Force resize for Babylon to correct aspect ratio
                    if (engine) setTimeout(() => engine.resize(), 0);
                    
                    genTextures();
                    if (!threeInit) init3D();
                    else updateMats();
                }
            };
        });
`;
html = html.replace(tabRegex, newTabCode);

// Fix Checkbox Listeners to call updateMats
const checkboxRegex = /document\.getElementById\('r3H'\)\.oninput[\s\S]*?cFY'\].forEach\(id => \{[\s\S]*?\}\);\s*/s;
const newCheckboxCode = `
        // Fixed Checkbox/Input Listeners
        const faces = ['B', 'L', 'R', 'F'];
        const types = ['R', 'SU', 'SV', 'X', 'Y'];
        faces.forEach(f => {
            types.forEach(t => {
                const id = 'c' + f + t;
                const el = document.getElementById(id);
                // Listen to both change and input mostly for sliders/numbers
                if(el) {
                    el.onchange = () => { if (threeInit) updateMats(); };
                    el.oninput = () => { if (threeInit) updateMats(); };
                }
            });
        });
`;
html = html.replace(checkboxRegex, newCheckboxCode);

// Write Output
fs.writeFileSync(OUTPUT_FILE, html);
console.log(`Created ${OUTPUT_FILE}`);
