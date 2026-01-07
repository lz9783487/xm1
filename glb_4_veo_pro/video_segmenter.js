import { DewarpProcessor } from './dewarp_processor.js';

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
            'box_zuo': { x: 0.25, y: 0.0, w: 0.25, h: 1.0 },
            'box_you': { x: 0.5, y: 0.0, w: 0.25, h: 1.0 },
            'box_di': { x: 0.75, y: 0.0, w: 0.25, h: 1.0 }
        };

        this.dewarpProcessor = new DewarpProcessor();
        this.useDewarp = true;
        this.perspectivePoints = {};

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

    processFrame() {
        if (!this.isPlaying || this.videoElement.paused || this.videoElement.ended) return;

        const vw = this.videoElement.videoWidth;
        const vh = this.videoElement.videoHeight;
        if (!vw || !vh) return;

        this.tempCanvas.width = vw;
        this.tempCanvas.height = vh;
        this.tempCtx.drawImage(this.videoElement, 0, 0, vw, vh);

        this.activeFaces.forEach(face => {
            const ctx = this.contexts[face];
            const cvs = this.channels[face];

            // 检查是否有透视点数据
            if (this.useDewarp && this.perspectivePoints[face] && this.perspectivePoints[face].length === 4) {
                const pts = this.perspectivePoints[face];

                // === 修复点：直接按顺序传递 ===
                // RegionSelector 传过来的 pts 已经是 [左上, 右上, 右下, 左下] 的顺时针顺序了
                // 不需要再手动交换索引
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
                        this.videoElement,
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