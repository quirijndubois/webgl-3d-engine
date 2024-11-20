class WebGLRenderer {
    constructor(canvas, resolution) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl");

        this.resolution = resolution;
        this.rotationX = 0.0;
        this.rotationY = 0.0;
        this.f = 1.0;
        this.cameraPosition = { x: 0.0, y: 0.0, z: -1.0 };
        this.isDragging = false;
        this.lastMousePosition = { x: 0, y: 0 };
        this.movement = { w: false, a: false, s: false, d: false };

        this.canvas.width = this.resolution[0];
        this.canvas.height = this.resolution[1];
        this.gl.viewport(0, 0, this.resolution[0], this.resolution[1]);

        this.gl.enable(this.gl.DEPTH_TEST);

        this.depthTexture = this.createDepthTexture();
        this.program = this.createProgram();
        this.positionBuffer = null;
        this.indexBuffer = null;
        this.triangles = [];

        this.setupMouseControls();
        this.setupKeyboardControls();
    }

    setupMouseControls() {
        this.canvas.addEventListener("mousedown", (e) => {
            this.isDragging = true;
            this.lastMousePosition = { x: e.clientX, y: e.clientY };
        });

        this.canvas.addEventListener("mousemove", (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMousePosition.x;
                const deltaY = e.clientY - this.lastMousePosition.y;

                this.rotationY += deltaX * 0.002 / this.f;
                this.rotationX += deltaY * 0.002 / this.f;

                this.lastMousePosition = { x: e.clientX, y: e.clientY };

                this.draw();
            }
        });

        this.canvas.addEventListener("mouseup", () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener("mouseleave", () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener("wheel", (e) => {
            this.f += e.deltaY * -0.0001 * this.f;
            this.f = Math.max(0.1, Math.min(10.0, this.f));
            this.draw();
        });
    }

    setupKeyboardControls() {
        document.addEventListener("keydown", (e) => {
            if (["w", "a", "s", "d"].includes(e.key)) {
                this.movement[e.key] = true;
            }
        });

        document.addEventListener("keyup", (e) => {
            if (["w", "a", "s", "d"].includes(e.key)) {
                this.movement[e.key] = false;
            }
        });

        const updateCameraPosition = () => {
            const speed = 0.02;

            const direction = {
                x: Math.sin(this.rotationY) * Math.cos(this.rotationX),
                y: -Math.sin(this.rotationX),
                z: Math.cos(this.rotationY) * Math.cos(this.rotationX)
            };

            if (this.movement.w) {
                this.cameraPosition.x += direction.x * speed;
                this.cameraPosition.y += direction.y * speed;
                this.cameraPosition.z += direction.z * speed;
            }
            if (this.movement.s) {
                this.cameraPosition.x -= direction.x * speed;
                this.cameraPosition.y -= direction.y * speed;
                this.cameraPosition.z -= direction.z * speed;
            }
            if (this.movement.a) {
                this.cameraPosition.x -= direction.z * speed;
                this.cameraPosition.z += direction.x * speed;
            }
            if (this.movement.d) {
                this.cameraPosition.x += direction.z * speed;
                this.cameraPosition.z -= direction.x * speed;
            }

            this.draw();
            requestAnimationFrame(updateCameraPosition);
        };
        updateCameraPosition();
    }


    createDepthTexture() {
        const depthTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, depthTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.DEPTH_COMPONENT, this.resolution[0], this.resolution[1], 0, this.gl.DEPTH_COMPONENT, this.gl.UNSIGNED_INT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        return depthTexture;
    }
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error("Shader compilation failed:", this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aUV;
            varying vec2 vUV;
            varying float vDepth;

            uniform float uRotationX;
            uniform float uRotationY;
            uniform float uF;
            uniform vec3 uCameraPosition;
            
            uniform float aspectRatio;

            mat3 rotateXMatrix(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat3(
                    1.0, 0.0, 0.0,
                    0.0, c, -s,
                    0.0, s, c
                );
            }

            mat3 rotateYMatrix(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat3(
                    c, 0.0, s,
                    0.0, 1.0, 0.0,
                    -s, 0.0, c
                );
            }

            void main() {        
                mat3 rotationMatrix = rotateXMatrix(uRotationX) * rotateYMatrix(uRotationY);
                vec3 rotatedPosition = rotationMatrix * (aPosition - uCameraPosition);

                float factor = uF / rotatedPosition.z;

                vUV = aUV;
                vDepth = rotatedPosition.z;

                vec3 screenPosition = vec3(rotatedPosition.xy * factor, rotatedPosition.z) - vec3(0.0, 0.0, uF);
                screenPosition.z *= 0.0001;
                screenPosition.x /= aspectRatio;

                if (rotatedPosition.z > 0.01) {
                    gl_Position = vec4(screenPosition, 1.0);
                }
            }
        `;

        const fragmentShaderSource = `
            precision highp float;
            varying vec2 vUV;
            varying float vDepth;
            uniform vec4 uColor;

            void main() {

                if (vDepth < 0.1) {
                    discard;
                }

                gl_FragColor = uColor;
            }
        `;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error("Program linking failed:", this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    setTriangles(triangles) {
        this.triangles = triangles;
        this.createBuffers();
    }

    createBuffers() {
        let allVertices = [];
        let allUVs = [];
        let indices = [];

        this.triangles.forEach((triangle, index) => {
            const vertexOffset = index * 3;
            allVertices.push(...triangle.vertices);
            allUVs.push(...triangle.uvs);
            indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
        });

        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(allVertices), this.gl.STATIC_DRAW);

        this.uvBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(allUVs), this.gl.STATIC_DRAW);

        this.indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);
    }

    draw() {
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        this.gl.useProgram(this.program);

        const aPositionLocation = this.gl.getAttribLocation(this.program, "aPosition");
        const aUVLocation = this.gl.getAttribLocation(this.program, "aUV");
        const uColorLocation = this.gl.getUniformLocation(this.program, "uColor");
        const uRotationXLocation = this.gl.getUniformLocation(this.program, "uRotationX");
        const uRotationYLocation = this.gl.getUniformLocation(this.program, "uRotationY");
        const uFLocation = this.gl.getUniformLocation(this.program, "uF");
        const uCameraPositionLocation = this.gl.getUniformLocation(this.program, "uCameraPosition");
        const aspectRatioLocation = this.gl.getUniformLocation(this.program, "aspectRatio");

        this.gl.enableVertexAttribArray(aPositionLocation);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(aPositionLocation, 3, this.gl.FLOAT, false, 0, 0);

        this.gl.enableVertexAttribArray(aUVLocation);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
        this.gl.vertexAttribPointer(aUVLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.uniform1f(uRotationXLocation, this.rotationX);
        this.gl.uniform1f(uRotationYLocation, this.rotationY);
        this.gl.uniform1f(uFLocation, this.f);
        this.gl.uniform3fv(uCameraPositionLocation, [this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z]);
        this.gl.uniform1f(aspectRatioLocation, this.canvas.width / this.canvas.height);

        this.triangles.forEach((triangle, index) => {
            this.gl.uniform4f(uColorLocation, ...triangle.color);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
            this.gl.drawElements(this.gl.TRIANGLES, 3, this.gl.UNSIGNED_SHORT, index * 3 * 2);
        });
    }
}




class Triangle {
    constructor(A, B, C, color, uvA, uvB, uvC) {
        this.vertices = [A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z];
        this.uvs = [uvA.x, uvA.y, uvB.x, uvB.y, uvC.x, uvC.y];
        this.color = color;
    }
}

class Cube {
    constructor(width, height, depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;

        const A = { x: this.width / 2, y: this.height / 2, z: this.depth / 2 };
        const B = { x: -this.width / 2, y: this.height / 2, z: this.depth / 2 };
        const C = { x: -this.width / 2, y: -this.height / 2, z: this.depth / 2 };
        const D = { x: this.width / 2, y: -this.height / 2, z: this.depth / 2 };

        const E = { x: this.width / 2, y: this.height / 2, z: -this.depth / 2 };
        const F = { x: -this.width / 2, y: this.height / 2, z: -this.depth / 2 };
        const G = { x: -this.width / 2, y: -this.height / 2, z: -this.depth / 2 };
        const H = { x: this.width / 2, y: -this.height / 2, z: -this.depth / 2 };

        const uvA = { x: 1, y: 1 }, uvB = { x: 0, y: 1 }, uvC = { x: 0, y: 0 }, uvD = { x: 1, y: 0 };


        this.triangles = [
            // Front face, red
            new Triangle(A, B, C, [1.0, 0.0, 0.0, 1.0], uvA, uvB, uvC),
            new Triangle(A, D, C, [1.0, 0.0, 0.0, 1.0], uvA, uvD, uvC),
            // Back face, green
            new Triangle(E, F, G, [0.0, 1.0, 0.0, 1.0], uvA, uvB, uvC),
            new Triangle(E, H, G, [0.0, 1.0, 0.0, 1.0], uvA, uvD, uvC),
            // Left face, blue
            new Triangle(A, E, H, [0.0, 0.0, 1.0, 1.0], uvA, uvB, uvC),
            new Triangle(A, D, H, [0.0, 0.0, 1.0, 1.0], uvA, uvD, uvC),
            // Right face, yellow
            new Triangle(B, F, G, [1.0, 1.0, 0.0, 1.0], uvA, uvB, uvC),
            new Triangle(B, C, G, [1.0, 1.0, 0.0, 1.0], uvA, uvD, uvC),
            // Bottom face, magenta
            new Triangle(E, F, B, [1.0, 0.0, 1.0, 1.0], uvA, uvB, uvC),
            new Triangle(E, A, B, [1.0, 0.0, 1.0, 1.0], uvA, uvD, uvC),
            // Top face, cyan
            new Triangle(G, H, D, [0.0, 1.0, 1.0, 1.0], uvA, uvB, uvC),
            new Triangle(G, C, D, [0.0, 1.0, 1.0, 1.0], uvA, uvD, uvC),
        ];
    }
}

class Sphere {
    constructor(radius, n, m) {
        this.radius = radius;
        this.triangles = [];

        const vertices = [];
        const uvCoords = [];

        for (let i = 0; i <= n; i++) {
            const theta = (i / n) * Math.PI;
            for (let j = 0; j <= m; j++) {
                const phi = (j / m) * 2 * Math.PI;

                const x = this.radius * Math.sin(theta) * Math.cos(phi);
                const y = this.radius * Math.cos(theta);
                const z = this.radius * Math.sin(theta) * Math.sin(phi);

                vertices.push({ x, y, z });

                const u = j / m;
                const v = i / n;
                uvCoords.push({ x: u, y: v });
            }
        }
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < m; j++) {
                const idx1 = i * (m + 1) + j;
                const idx2 = idx1 + m + 1;
                const idx3 = idx1 + 1;
                const idx4 = idx2 + 1;

                const randomColor1 = [Math.random(), Math.random(), Math.random(), 1.0];
                const randomColor2 = [Math.random(), Math.random(), Math.random(), 1.0];

                let index = i * (m + 1) + j;
                let factor = index % 2
                const color1 = [1 - factor / 2, 1 - factor / 2, 1, 1.0];
                const color2 = [color1[0] / 2, color1[1] / 2, color1[2] / 2, 1.0];

                this.triangles.push(new Triangle(
                    vertices[idx1],
                    vertices[idx2],
                    vertices[idx3],
                    color1,
                    uvCoords[idx1],
                    uvCoords[idx2],
                    uvCoords[idx3]
                ));

                this.triangles.push(new Triangle(
                    vertices[idx3],
                    vertices[idx2],
                    vertices[idx4],
                    color2,
                    uvCoords[idx3],
                    uvCoords[idx2],
                    uvCoords[idx4]
                ));
            }
        }
    }
}

let resolution = [window.innerWidth, window.innerHeight];

const canvas = document.getElementById("glCanvas");
const renderer = new WebGLRenderer(canvas, resolution);


const cube = new Cube(1.0, 1.0, 1.0);
let resolutionPower = 4;
const sphere = new Sphere(0.5, 2 ** resolutionPower, 2 ** resolutionPower);

renderer.setTriangles(sphere.triangles);
renderer.draw();
