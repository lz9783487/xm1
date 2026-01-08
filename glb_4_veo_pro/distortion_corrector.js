
export class DistortionCorrector {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true });

        if (!this.gl) {
            console.error("DistortionCorrector: WebGL not supported");
            return;
        }

        this.program = null;
        this.texture = null;

        // Params
        // this.params = {
        //     top: 0.0,
        //     bottom: 0.0,
        //     left: 0.0,
        //     right: 0.0,
        //     scale: 1.0
        // };
        this.params = {
            top: 0.3,
            bottom: 0.3,
            left: 0.1,
            right: 0.1,
            scale: 1.0
        };
        this._initShaders();
        this._initBuffers();
    }

    setParams(params) {
        Object.assign(this.params, params);
    }

    getCanvas() {
        return this.canvas;
    }

    _initShaders() {
        const vsSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform sampler2D u_image;
            uniform float u_top;
            uniform float u_bottom;
            uniform float u_left;
            uniform float u_right;
            uniform float u_scale;
            varying vec2 v_texCoord;

            void main() {
                // 1. Get raw screen coordinates (-1.0 to 1.0)
                vec2 st = v_texCoord * 2.0 - 1.0;

                // 2. Apply scale first to get "virtual image coords"
                vec2 scaledST = st / u_scale;

                // 3. Distance squared based on scaled coords
                float dx2 = scaledST.x * scaledST.x;
                float dy2 = scaledST.y * scaledST.y;

                // 4. Select warp coefficient based on sign
                float warpCoefY = (scaledST.y > 0.0) ? u_top : u_bottom;
                float warpCoefX = (scaledST.x > 0.0) ? u_right : u_left;

                // 5. Calculate distortion factors
                float factorX = 1.0 - warpCoefX * dy2;
                float factorY = 1.0 - warpCoefY * dx2;

                // 6. Apply distortion
                vec2 distortedST = vec2(scaledST.x * factorX, scaledST.y * factorY);

                // 7. Convert back to UV (0.0 to 1.0)
                vec2 finalUV = (distortedST + 1.0) * 0.5;

                // 8. Boundary check
                if (finalUV.x < 0.0 || finalUV.x > 1.0 || finalUV.y < 0.0 || finalUV.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    gl_FragColor = texture2D(u_image, finalUV);
                }
            }
        `;

        const vertexShader = this._createShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this._createShader(this.gl.FRAGMENT_SHADER, fsSource);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('DistortionCorrector: Program link error:', this.gl.getProgramInfoLog(this.program));
        }

        this.gl.useProgram(this.program);
    }

    _createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('DistortionCorrector: Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _initBuffers() {
        // Full screen quad, flipped Y for WebGL texture
        const vertices = new Float32Array([
            -1.0, -1.0, 0.0, 0.0,
            1.0, -1.0, 1.0, 0.0,
            -1.0, 1.0, 0.0, 1.0,
            1.0, 1.0, 1.0, 1.0
        ]);

        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const a_position = this.gl.getAttribLocation(this.program, "a_position");
        const a_texCoord = this.gl.getAttribLocation(this.program, "a_texCoord");

        this.gl.enableVertexAttribArray(a_position);
        this.gl.vertexAttribPointer(a_position, 2, this.gl.FLOAT, false, 4 * 4, 0);

        this.gl.enableVertexAttribArray(a_texCoord);
        this.gl.vertexAttribPointer(a_texCoord, 2, this.gl.FLOAT, false, 4 * 4, 2 * 4);
    }

    _initTexture() {
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        // Flip Y for WebGL
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    }

    process(source) {
        if (!this.gl || !this.program) return;

        // Ensure texture is initialized
        if (!this.texture) this._initTexture();

        // Resize canvas if needed
        const width = source.videoWidth || source.width;
        const height = source.videoHeight || source.height;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }

        // Update texture
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        // Important: check if source is ready
        try {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
        } catch (e) {
            // Source might not be ready (e.g. video loading)
            return;
        }

        this.gl.useProgram(this.program);

        // Update Uniforms
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "u_top"), this.params.top);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "u_bottom"), this.params.bottom);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "u_left"), this.params.left);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "u_right"), this.params.right);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "u_scale"), this.params.scale);

        // Draw
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
