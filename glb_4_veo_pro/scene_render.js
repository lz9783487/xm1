export class SceneRender {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        // 禁止浏览器劫持滚轮
        this.canvas.addEventListener("wheel", (evt) => evt.preventDefault(), { passive: false });

        this.engine = null;
        this.scene = null;
        this.materialsMap = null;
        this.dynamicTextures = {};
        this.onRender = null;

        // 硬编码模型路径 (请确保该文件在同一目录下，且通过 Local Server 访问)
        this.modelPath = "./Untitled5.glb";
    }

    async init() {
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.08, 0.08, 0.1, 1);

        this._setupCamera();
        this._setupLight();
        this._initMaterialsConfig(); // 加载你的旋转配置

        await this._loadModel();

        this.engine.runRenderLoop(() => {
            this.scene.render();
            if (this.onRender) this.onRender();
        });

        window.addEventListener("resize", () => this.engine.resize());
    }

    setRenderCallback(callback) {
        this.onRender = callback;
    }

    _setupCamera() {
        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 0, 0), this.scene);
        camera.attachControl(this.canvas, true);
        camera.wheelPrecision = 30;
        camera.minZ = 0.1;
    }

    _setupLight() {
        const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = 0.8;
        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dirLight.intensity = 0.5;
    }

    // === 这里严格照搬了你之前的成功配置 ===
    _initMaterialsConfig() {
        this.materialsMap = {
            'box_qian': { name: 'box_qian', matObject: null, config: { wAng: -Math.PI / 2, uScale: -1, vScale: 1 } },
            'box_hou': { name: 'box_hou', matObject: null, config: { wAng: 0, uScale: -1, vScale: -1 } },
            'box_zuo': { name: 'box_zuo', matObject: null, config: { wAng: -Math.PI, uScale: 1, vScale: -1 } },
            'box_you': { name: 'box_you', matObject: null, config: { wAng: Math.PI / 2, uScale: 1, vScale: -1 } },
            'box_di': { name: 'box_di', matObject: null, config: { wAng: Math.PI, uScale: -1, vScale: 1 } }
        };
    }

    async _loadModel() {
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync("", this.modelPath, "", this.scene, null, ".glb");
            const root = result.meshes[0];
            root.normalizeToUnitCube();

            // 1. 绑定材质
            for (let key in this.materialsMap) {
                const targetName = this.materialsMap[key].name;
                const foundMat = this.scene.getMaterialByName(targetName);
                if (foundMat) {
                    this.materialsMap[key].matObject = foundMat;
                    foundMat.roughness = 1.0;
                    foundMat.metallic = 0.0;
                    foundMat.albedoColor = new BABYLON.Color3(0.5, 0.5, 0.5);
                }
            }

            // 2. 严格照搬之前的智能 UV 修复逻辑
            result.meshes.forEach(m => {
                if (m.material && m.material.name === this.materialsMap['box_di'].name) {
                    this._fixFloorUVsSmart(m);
                }
            });

        } catch (e) {
            console.error(e);
            alert("模型加载失败，请检查路径或确保使用了本地服务器(localhost)");
        }
    }

    bindTexturesToMaterials(canvasMap) {
        for (let key in this.materialsMap) {
            const target = this.materialsMap[key];
            if (!target.matObject || !canvasMap[key]) continue;

            if (target.matObject.albedoTexture) target.matObject.albedoTexture.dispose();
            if (this.dynamicTextures[key]) this.dynamicTextures[key].dispose();

            const canvas = canvasMap[key];
            const texture = new BABYLON.DynamicTexture(`tex_${key}`, canvas, this.scene, true);

            // === 核心修复：强制设置纹理包裹模式为 REPEAT ===
            // 之前的 VideoTexture 默认可能是 Repeat，但 DynamicTexture 默认可能是 Clamp
            // 当 uScale 为 -1 时，Clamp 会导致边缘像素被拉伸成条纹，Repeat 则会正常翻转。
            texture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; // 1 = WRAP (Repeat)
            texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; // 1 = WRAP (Repeat)
            // ===========================================

            // 应用之前的配置
            const conf = target.config;
            texture.uRotationCenter = 0.5;
            texture.vRotationCenter = 0.5;
            texture.wAng = conf.wAng;
            texture.uScale = conf.uScale;
            texture.vScale = conf.vScale;

            target.matObject.albedoTexture = texture;
            target.matObject.emissiveTexture = texture;
            target.matObject.emissiveColor = new BABYLON.Color3(1, 1, 1);

            this.dynamicTextures[key] = texture;
        }
    }

    updateTextures(canvasMap) {
        for (let key in this.dynamicTextures) {
            // 参数 false 表示不反转 Y 轴，因为我们在 config 里通过 scale 控制了方向
            this.dynamicTextures[key].update(false);
        }
    }

    // === 严格照搬之前的智能 UV 算法 ===
    _fixFloorUVsSmart(floorMesh) {
        let meshQian = null, meshHou = null;
        this.scene.meshes.forEach(m => {
            if (m.material && m.material.name === 'box_qian') meshQian = m;
            if (m.material && m.material.name === 'box_hou') meshHou = m;
        });
        if (!meshQian || !meshHou) return;

        const centerQian = meshQian.getBoundingInfo().boundingBox.centerWorld;
        const centerHou = meshHou.getBoundingInfo().boundingBox.centerWorld;
        const positions = floorMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        if (!positions) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], z = positions[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const rangeX = maxX - minX || 1;
        const rangeZ = maxZ - minZ || 1;
        const diffX = centerQian.x - centerHou.x;
        const diffZ = centerQian.z - centerHou.z;
        const isAlignedZ = Math.abs(diffZ) > Math.abs(diffX);

        const uvs = [];
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], z = positions[i + 2];
            let u, v;
            if (isAlignedZ) {
                u = (x - minX) / rangeX;
                if (diffZ > 0) v = (z - minZ) / rangeZ;
                else v = 1.0 - ((z - minZ) / rangeZ);
            } else {
                u = (z - minZ) / rangeZ;
                if (diffX > 0) v = (x - minX) / rangeX;
                else v = 1.0 - ((x - minX) / rangeX);
            }
            uvs.push(u, v);
        }
        floorMesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs);
    }
}