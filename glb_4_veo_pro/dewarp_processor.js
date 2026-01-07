/**
 * DewarpProcessor - 透视去畸变处理器
 * 
 * 基于单应性矩阵 (Homography Matrix) 实现透视变换
 * 从 transform5_多面导出3d.html 提取的核心算法
 */
export class DewarpProcessor {
    constructor() {
        this.tempCanvas = document.createElement('canvas');
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
    }

    /**
     * 计算单应性矩阵
     * @param {number} width - 目标宽度
     * @param {number} height - 目标高度
     * @param {Array} sourcePoints - 源图像上的4个点 [{x, y}, {x, y}, {x, y}, {x, y}]
     * @returns {Array|null} 9元素的单应性矩阵，如果计算失败返回null
     */
    calcHomography(width, height, sourcePoints) {
        if (!sourcePoints || sourcePoints.length !== 4) {
            console.error('需要提供4个源点');
            return null;
        }

        const sx = sourcePoints.map(p => p.x);
        const sy = sourcePoints.map(p => p.y);

        // 目标点：矩形的四个角
        const dx = [0, width, width, 0];
        const dy = [0, 0, height, height];

        // 构建8x8线性方程组 A·h = b
        const A = [];
        const b = [];

        for (let i = 0; i < 4; i++) {
            // 为每个点对添加两个方程
            A.push([dx[i], dy[i], 1, 0, 0, 0, -sx[i] * dx[i], -sx[i] * dy[i]]);
            A.push([0, 0, 0, dx[i], dy[i], 1, -sy[i] * dx[i], -sy[i] * dy[i]]);
            b.push(sx[i]);
            b.push(sy[i]);
        }

        // 高斯消元法求解线性方程组
        const solution = this._solveLinearSystem(A, b);
        if (!solution) return null;

        // 返回9元素矩阵 (最后一个元素固定为1)
        return [...solution, 1];
    }

    /**
     * 高斯消元法求解线性方程组
     * @private
     */
    _solveLinearSystem(A, b) {
        const n = 8;

        try {
            // 前向消元
            for (let i = 0; i < n; i++) {
                // 选择主元
                let maxRow = i;
                for (let k = i + 1; k < n; k++) {
                    if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
                        maxRow = k;
                    }
                }

                // 交换行
                [A[i], A[maxRow]] = [A[maxRow], A[i]];
                [b[i], b[maxRow]] = [b[maxRow], b[i]];

                // 消元
                for (let j = i + 1; j < n; j++) {
                    const factor = A[j][i] / A[i][i];
                    b[j] -= factor * b[i];
                    for (let k = i; k < n; k++) {
                        A[j][k] -= factor * A[i][k];
                    }
                }
            }

            // 回代求解
            const x = new Array(n);
            for (let i = n - 1; i >= 0; i--) {
                let sum = 0;
                for (let j = i + 1; j < n; j++) {
                    sum += A[i][j] * x[j];
                }
                x[i] = (b[i] - sum) / A[i][i];
            }

            return x;
        } catch (e) {
            console.error('线性方程组求解失败:', e);
            return null;
        }
    }

    /**
     * 应用透视变换到图像区域
     * @param {HTMLCanvasElement} srcCanvas - 源canvas
     * @param {Array} srcPoints - 源图像上的4个点（顺时针：左上、右上、右下、左下）
     * @param {HTMLCanvasElement} dstCanvas - 目标canvas
     * @param {Object} fillColor - 填充颜色 {r, g, b} (可选)
     */
    warpRegion(srcCanvas, srcPoints, dstCanvas, fillColor = null) {
        if (!srcPoints || srcPoints.length !== 4) {
            console.error('需要提供4个点');
            return;
        }

        // 计算输出尺寸：使用点之间的距离
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const width = Math.max(dist(srcPoints[0], srcPoints[1]), dist(srcPoints[2], srcPoints[3])) | 0;
        const height = Math.max(dist(srcPoints[0], srcPoints[3]), dist(srcPoints[1], srcPoints[2])) | 0;

        if (width <= 0 || height <= 0) {
            console.error('无效的区域尺寸');
            return;
        }

        // 设置目标canvas尺寸
        dstCanvas.width = width;
        dstCanvas.height = height;

        const dstCtx = dstCanvas.getContext('2d');

        // 计算单应性矩阵
        const H = this.calcHomography(width, height, srcPoints);
        if (!H) {
            console.error('单应性矩阵计算失败');
            return;
        }

        // 获取源图像数据
        const srcCtx = srcCanvas.getContext('2d');
        const srcImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

        // 创建目标图像数据
        const dstImageData = dstCtx.createImageData(width, height);

        // 确定填充颜色
        const fill = fillColor || this._getAverageColor(srcImageData);

        // 应用透视变换
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // 使用单应性矩阵计算源图像坐标
                const z = H[6] * x + H[7] * y + H[8];
                const srcX = (H[0] * x + H[1] * y + H[2]) / z;
                const srcY = (H[3] * x + H[4] * y + H[5]) / z;

                const dstIdx = (y * width + x) * 4;

                // 检查源坐标是否在有效范围内
                if (srcX >= 0 && srcX < srcCanvas.width && srcY >= 0 && srcY < srcCanvas.height) {
                    const srcIdx = ((srcY | 0) * srcCanvas.width + (srcX | 0)) * 4;
                    dstImageData.data[dstIdx] = srcImageData.data[srcIdx];
                    dstImageData.data[dstIdx + 1] = srcImageData.data[srcIdx + 1];
                    dstImageData.data[dstIdx + 2] = srcImageData.data[srcIdx + 2];
                    dstImageData.data[dstIdx + 3] = srcImageData.data[srcIdx + 3];
                } else {
                    // 使用填充颜色
                    dstImageData.data[dstIdx] = fill.r;
                    dstImageData.data[dstIdx + 1] = fill.g;
                    dstImageData.data[dstIdx + 2] = fill.b;
                    dstImageData.data[dstIdx + 3] = 255;
                }
            }
        }

        dstCtx.putImageData(dstImageData, 0, 0);
    }

    /**
     * 计算图像平均颜色（用于填充）
     * @private
     */
    _getAverageColor(imageData) {
        let r = 0, g = 0, b = 0, count = 0;

        // 采样以提高性能
        for (let i = 0; i < imageData.data.length; i += 40) {
            if (imageData.data[i + 3] > 0) { // alpha > 0
                r += imageData.data[i];
                g += imageData.data[i + 1];
                b += imageData.data[i + 2];
                count++;
            }
        }

        return {
            r: (r / count) | 0,
            g: (g / count) | 0,
            b: (b / count) | 0
        };
    }
}
