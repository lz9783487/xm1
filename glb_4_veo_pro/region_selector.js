export class RegionSelector {
    constructor(containerId, onSave) {
        this.container = document.getElementById(containerId);
        this.canvas = this.container.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.onSave = onSave; // 保存回调

        this.videoElement = null; // 引用源视频
        this.currentRegions = {}; // 当前编辑的区域数据
        this.activeFace = null;   // 当前正在框选哪个面 (例如 'box_qian')

        // 新增：选择模式
        this.selectionMode = 'rect'; // 'rect' | 'perspective'

        // 透视模式相关
        this.perspectivePoints = {}; // 存储每个面的8个点 (4个后墙点 + 4个关联点)
        this.activePoint = -1; // 当前拖拽的点索引 (-1表示无)

        this.isDragging = false;
        this.startPos = { x: 0, y: 0 };
        this.tempRect = null; // 正在拖拽中的框

        // 颜色配置
        this.colors = {
            'box_qian': '#FF0000', // 红
            'box_zuo': '#00FF00', // 绿
            'box_you': '#0000FF', // 蓝
            'box_di': '#FFFF00', // 黄
            'box_hou': '#888888'  // 灰 (默认不编辑，但显示)
        };

        this._initEvents();
    }

    /**
     * 打开编辑器
     * @param {HTMLVideoElement} video - 正在播放的视频元素
     * @param {Object} regions - 当前的区域配置
     */
    open(video, regions) {
        this.videoElement = video;
        this.currentRegions = regions;
        this.container.style.display = 'flex';
        this.resize();
        this.loop();
    }

    close() {
        this.container.style.display = 'none';
        this.videoElement = null;
    }

    // 设置当前要画哪个面的框
    setActiveFace(face) {
        this.activeFace = face;
        // 初始化透视点（如果还没有）
        if (this.selectionMode === 'perspective' && !this.perspectivePoints[face]) {
            this._initDefaultPerspectivePoints(face);
        }
        // 更新按钮状态样式
        document.querySelectorAll('.face-btn').forEach(btn => {
            if (btn.dataset.face === face) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    // 设置选择模式
    setMode(mode) {
        if (mode !== 'rect' && mode !== 'perspective') {
            console.error('无效的模式:', mode);
            return;
        }
        this.selectionMode = mode;

        // 切换到透视模式时，为当前激活的面初始化默认点
        if (mode === 'perspective' && this.activeFace && !this.perspectivePoints[this.activeFace]) {
            this._initDefaultPerspectivePoints(this.activeFace);
        }
    }

    // 初始化默认的透视点（基于当前矩形区域）
    _initDefaultPerspectivePoints(face) {
        const region = this.currentRegions[face];
        if (!region) {
            // 如果没有区域，使用默认值
            this.perspectivePoints[face] = [
                { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.1, y: 0.9 }, { x: 0.3, y: 0.9 }
            ];
            return;
        }

        // 基于现有矩形区域创建4个角点
        const { x, y, w, h } = region;
        this.perspectivePoints[face] = [
            { x: x, y: y },           // 左上
            { x: x + w, y: y },       // 右上
            { x: x, y: y + h },       // 左下
            { x: x + w, y: y + h }    // 右下
        ];
    }

    // 获取透视点配置（用于保存）
    getPerspectivePoints() {
        return JSON.parse(JSON.stringify(this.perspectivePoints));
    }

    save() {
        // 在透视模式下，同时传递透视点数据
        if (this.selectionMode === 'perspective') {
            if (this.onSave) this.onSave(this.currentRegions, this.perspectivePoints);
        } else {
            if (this.onSave) this.onSave(this.currentRegions);
        }
        this.close();
    }

    // 每一帧绘制：背景视频 + 已有的框 + 正在画的框
    loop() {
        if (this.container.style.display === 'none' || !this.videoElement) return;

        requestAnimationFrame(() => this.loop());

        const vw = this.canvas.width;
        const vh = this.canvas.height;

        this.ctx.clearRect(0, 0, vw, vh);

        // 1. 绘制视频底图
        this.ctx.drawImage(this.videoElement, 0, 0, vw, vh);
        this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
        this.ctx.fillRect(0, 0, vw, vh); // 加一层暗色遮罩，让框更明显

        if (this.selectionMode === 'rect') {
            // 矩形模式：绘制矩形框
            for (let face in this.currentRegions) {
                const r = this.currentRegions[face];
                this._drawRect(r, this.colors[face] || 'white', face);
            }
            if (this.isDragging && this.tempRect) {
                this._drawRect(this.tempRect, this.colors[this.activeFace], "正在框选...");
            }
        } else if (this.selectionMode === 'perspective') {
            // 透视模式：绘制所有面的透视点
            for (let face in this.perspectivePoints) {
                this._drawPerspectivePoints(face);
            }
        }
    }

    _drawRect(r, color, label) {
        const x = r.x * this.canvas.width;
        const y = r.y * this.canvas.height;
        const w = r.w * this.canvas.width;
        const h = r.h * this.canvas.height;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, w, h);

        this.ctx.fillStyle = color;
        this.ctx.font = "14px Arial";
        this.ctx.fillText(label, x, y - 5);
        this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
        this.ctx.fillRect(x, y, w, h);
    }

    _initEvents() {
        // 鼠标按下
        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.activeFace) return;
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width;
            const mouseY = (e.clientY - rect.top) / rect.height;

            if (this.selectionMode === 'perspective') {
                // 透视模式：检查是否点击了某个点
                this.activePoint = this._findNearestPoint(mouseX, mouseY);
                if (this.activePoint >= 0) {
                    this.isDragging = true;
                }
            } else {
                // 矩形模式：开始拖拽矩形
                this.isDragging = true;
                this.startPos = { x: mouseX, y: mouseY };
            }
        });

        // 鼠标移动
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const rect = this.canvas.getBoundingClientRect();
            const currX = (e.clientX - rect.left) / rect.width;
            const currY = (e.clientY - rect.top) / rect.height;

            if (this.selectionMode === 'perspective') {
                // 透视模式：移动当前点
                if (this.activePoint >= 0 && this.perspectivePoints[this.activeFace]) {
                    this.perspectivePoints[this.activeFace][this.activePoint] = { x: currX, y: currY };
                }
            } else {
                // 矩形模式：更新临时矩形
                const x = Math.min(this.startPos.x, currX);
                const y = Math.min(this.startPos.y, currY);
                const w = Math.abs(currX - this.startPos.x);
                const h = Math.abs(currY - this.startPos.y);
                this.tempRect = { x, y, w, h };
            }
        });

        // 鼠标抬起
        this.canvas.addEventListener('mouseup', () => {
            if (this.selectionMode === 'rect' && this.isDragging && this.tempRect) {
                // 保存当前框到 activeFace
                this.currentRegions[this.activeFace] = { ...this.tempRect };
            }
            this.isDragging = false;
            this.tempRect = null;
            this.activePoint = -1;
        });

        window.addEventListener('resize', () => this.resize());
    }

    // 查找最近的透视点
    _findNearestPoint(x, y) {
        if (!this.perspectivePoints[this.activeFace]) return -1;

        const threshold = 0.03; // 3% 的距离阈值
        const points = this.perspectivePoints[this.activeFace];

        for (let i = 0; i < points.length; i++) {
            const dist = Math.hypot(points[i].x - x, points[i].y - y);
            if (dist < threshold) return i;
        }
        return -1;
    }

    // 绘制透视点和连接线
    _drawPerspectivePoints(face) {
        const points = this.perspectivePoints[face];
        if (!points || points.length !== 4) return;

        const color = this.colors[face] || 'white';
        const isActive = face === this.activeFace;

        // 绘制四边形轮廓
        this.ctx.strokeStyle = isActive ? color : 'rgba(255,255,255,0.3)';
        this.ctx.lineWidth = isActive ? 3 : 2;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x * this.canvas.width, points[0].y * this.canvas.height);
        this.ctx.lineTo(points[1].x * this.canvas.width, points[1].y * this.canvas.height);
        this.ctx.lineTo(points[3].x * this.canvas.width, points[3].y * this.canvas.height);
        this.ctx.lineTo(points[2].x * this.canvas.width, points[2].y * this.canvas.height);
        this.ctx.closePath();
        this.ctx.stroke();

        // 绘制控制点
        if (isActive) {
            points.forEach((p, i) => {
                const x = p.x * this.canvas.width;
                const y = p.y * this.canvas.height;

                this.ctx.fillStyle = color;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 8, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = 'white';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                // 标签
                this.ctx.fillStyle = 'white';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(`P${i}`, x + 12, y - 12);
            });
        }
    }

    // 保持 canvas 比例与视频一致
    resize() {
        if (!this.videoElement) return;
        const aspect = this.videoElement.videoWidth / this.videoElement.videoHeight;
        if (!aspect) return;

        // 简单处理：让 canvas 宽度占满父容器 80%，高度自适应
        const containerW = this.container.clientWidth * 0.8;
        const containerH = this.container.clientHeight * 0.8;

        if (containerW / containerH > aspect) {
            this.canvas.height = containerH;
            this.canvas.width = containerH * aspect;
        } else {
            this.canvas.width = containerW;
            this.canvas.height = containerW / aspect;
        }
    }
}