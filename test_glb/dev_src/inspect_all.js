const { NodeIO } = require('@gltf-transform/core');
const { KHRTextureBasisu, KHRDracoMeshCompression } = require('@gltf-transform/extensions');
const draco3d = require('draco3dgltf');
const fs = require('fs');
const path = require('path');

async function main() {
    const io = new NodeIO()
        .registerExtensions([KHRTextureBasisu, KHRDracoMeshCompression])
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
        });

    const files = fs.readdirSync('.').filter(f => f.endsWith('.glb'));

    for (const file of files) {
        console.log(`\n--- Inspecting ${file} ---`);
        try {
            const document = await io.read(file);
            const root = document.getRoot();
            const materials = root.listMaterials().map(m => m.getName());
            console.log('Materials:', materials);
        } catch (e) {
            console.error(`Error reading ${file}:`, e.message);
        }
    }
}

main().catch(console.error);
