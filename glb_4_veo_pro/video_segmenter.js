import { DewarpProcessor } from './dewarp_processor.js';
import { DistortionCorrector } from './distortion_corrector.js';

export class VideoSegmenter {
    constructor() {
        this.videoElement = document.createElement('video');
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.loop = true;
        this.videoElement.crossOrigin = "anonymous";
        this.videoElement.setAttribute('webkit-playsinline', 'webkit-playsinline');

        this.isPlaying = false;
        this.faces = ['box_qian', 'box_hou', 'box_zuo', 'box_you', 'box_di'];
        this.activeFaces = ['box_qian', 'box_zuo', 'box_you', 'box_di'];

        this.channels = {};
        this.contexts = {};

        this.faces.forEach(face => {
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 512;
            this.channels[face] = c;
            this.contexts[face] = c.getContext('2d', { willReadFrequently: true });
        });

        // 默认区域
        this.regions = {
            'box_qian': { x: 0.0, y: 0.0, w: 0.25, h: 1.0 },
            'box_hou': { x: 0.0, y: 0.0, w: 0.0, h: 0.0 },
            'box_zuo': { x: 0.5, y: 0.0, w: 0.25, h: 1.0 },
            'box_you': { x: 0.25, y: 0.0, w: 0.25, h: 1.0 },
            'box_di': { x: 0.75, y: 0.0, w: 0.25, h: 1.0 }
        };

        this.dewarpProcessor = new DewarpProcessor();
        this.useDewarp = true;
        this.perspectivePoints = {};

        // 加入 DistortionCorrector (img_process logic)
        this.distortionCorrector = new DistortionCorrector();
        // 可以在这里设置默认参数，如果需要的话
        // this.distortionCorrector.setParams({ scale: 1.0 });

        this.tempCanvas = document.createElement('canvas');
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
    }

    async loadVideo(url) {
        this.videoElement.src = url;
        await this.videoElement.play();
        this.isPlaying = true;
    }

    async loadWebcam() {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        this.videoElement.srcObject = stream;
        await this.videoElement.play();
        this.isPlaying = true;
    }

    /**
     * 获取当前的视频源（经过处理的 Canvas 或者 原始 Video）
     * 提供给外部 (如 region_selector) 使用
     */
    getSource() {
        return this.distortionCorrector.getCanvas();
    }

    /**
     * 设置畸变修正参数
     */
    setDistortionParams(params) {
        this.distortionCorrector.setParams(params);
    }

    processFrame() {
        if (!this.isPlaying || this.videoElement.paused || this.videoElement.ended) return;

        const vw = this.videoElement.videoWidth;
        const vh = this.videoElement.videoHeight;
        if (!vw || !vh) return;

        // 1. 先通过 DistortionCorrector 处理一帧
        this.distortionCorrector.process(this.videoElement);
        const source = this.distortionCorrector.getCanvas();

        // 2. 将处理后的 source 绘制到 tempCanvas
        // 注意：source 是 canvas，宽高应该已经和 video 一致
        if (this.tempCanvas.width !== source.width || this.tempCanvas.height !== source.height) {
            this.tempCanvas.width = source.width;
            this.tempCanvas.height = source.height;
        }

        this.tempCtx.drawImage(source, 0, 0, source.width, source.height);

        this.activeFaces.forEach(face => {
            const ctx = this.contexts[face];
            const cvs = this.channels[face];

            // 检查是否有透视点数据
            if (this.useDewarp && this.perspectivePoints[face] && this.perspectivePoints[face].length === 4) {
                const pts = this.perspectivePoints[face];

                // === 修复点：直接按顺序传递 ===
                const srcPoints = pts.map(p => ({
                    x: p.x * vw,
                    y: p.y * vh
                }));

                this.dewarpProcessor.warpRegion(this.tempCanvas, srcPoints, cvs);
            } else {
                // 降级回普通矩形切片
                const r = this.regions[face];
                if (r && r.w > 0 && r.h > 0) {
                    ctx.drawImage(
                        this.tempCanvas, // 使用 tempCanvas，其中包含了 dewarp 后的图像
                        r.x * vw, r.y * vh, r.w * vw, r.h * vh,
                        0, 0, cvs.width, cvs.height
                    );
                }
            }
        });
    }

    getCanvases() { return this.channels; }
    setRegion(face, region) { if (this.regions[face]) this.regions[face] = region; }
    getRegions() { return JSON.parse(JSON.stringify(this.regions)); }
    setDewarpMode(enabled) { this.useDewarp = enabled; }
    setPerspectivePoints(face, points) {
        if (points && points.length === 4) {
            this.perspectivePoints[face] = points;
        }
    }
    getPerspectivePoints() { return JSON.parse(JSON.stringify(this.perspectivePoints)); }
}