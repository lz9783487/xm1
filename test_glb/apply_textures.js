/**
 * Texture Application Script
 * 
 * Applies specific textures to the target GLB model with custom transformations
 * (rotation, mirror). Configuration is hardcoded based on user requirements.
 * 
 * Usage: node apply_textures.js
 */
const { NodeIO } = require('@gltf-transform/core');
const { KHRTextureBasisu, KHRDracoMeshCompression } = require('@gltf-transform/extensions');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const draco3d = require('draco3dgltf');

const GLB_PATH = 'Untitled4.glb';
const OUTPUT_PATH = 'room_textured.glb';

// Configuration mapping from user's interactive session
const materialConfig = [
    { name: "Material.001", img: "textures/split4_zuo.png", rotation: 0, mirrorH: false, mirrorV: true },
    { name: "Material.002", img: "textures/split4_qian.png", rotation: 270, mirrorH: false, mirrorV: false },
    { name: "Material.003", img: "textures/split4_you.png", rotation: 270, mirrorH: false, mirrorV: true },
    // Material.004 is skipped (empty in user image)
    { name: "Material.005", img: "textures/split4_xia.png", rotation: 270, mirrorH: false, mirrorV: true }
];

async function main() {
    const io = new NodeIO()
        .registerExtensions([KHRTextureBasisu, KHRDracoMeshCompression])
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
        });

    console.log(`Reading ${GLB_PATH}...`);
    const document = await io.read(GLB_PATH);
    const root = document.getRoot();

    for (const config of materialConfig) {
        const material = root.listMaterials().find(m => m.getName() === config.name);
        if (!material) {
            console.warn(`Material not found: ${config.name}`);
            continue;
        }

        console.log(`Processing material: ${config.name} with ${config.img}`);

        if (!fs.existsSync(config.img)) {
            console.error(`Texture file missing: ${config.img}`);
            continue;
        }

        // Apply transformations using sharp
        let image = sharp(config.img);

        if (config.rotation) image = image.rotate(config.rotation);
        if (config.mirrorH) image = image.flop(); // Horizon mirror
        if (config.mirrorV) image = image.flip(); // Vertical mirror

        const buffer = await image.toBuffer();

        // Create texture in GLTF
        const texture = document.createTexture(config.name + '_tex')
            .setImage(buffer)
            .setMimeType('image/png');

        // Assign to material
        material.setBaseColorTexture(texture);
        material.setBaseColorFactor([1, 1, 1, 1]); // Reset color to white

        // Remove any existing textures on other slots if necessary?
        // For now just setting baseColorTexture is what user requested.
    }

    console.log(`Writing to ${OUTPUT_PATH}...`);
    await io.write(OUTPUT_PATH, document);
    console.log('Done.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
