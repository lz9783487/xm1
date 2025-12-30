const { NodeIO } = require('@gltf-transform/core');
const { KHRTextureBasisu, KHRDracoMeshCompression } = require('@gltf-transform/extensions');
const draco3d = require('draco3dgltf');

const GLB_PATH = 'room.glb';

async function main() {
    const io = new NodeIO()
        .registerExtensions([KHRTextureBasisu, KHRDracoMeshCompression])
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
        });

    console.log(`Reading ${GLB_PATH}...`);
    const document = await io.read(GLB_PATH);
    const root = document.getRoot();

    console.log('Materials found:');
    root.listMaterials().forEach(m => {
        console.log(`- "${m.getName()}"`);
    });
}

main().catch(console.error);
