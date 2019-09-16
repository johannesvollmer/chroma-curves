function main(){
    const input = document.getElementById("image-input") 
    const label = document.getElementById("image-label") 
    const canvas = document.getElementById("gl")
    const loading = document.getElementById("loading")
    const original = document.getElementById("original")
    const path = document.getElementById("curve-path")
    const controlPoints = document.getElementById("control-points")
    const intensity = document.getElementById("intensity-slider")
    const histogramPath = document.getElementById("histogram-path")
    // const reset = document.getElementById("reset-curve")

    const gl = canvas.getContext("webgl2")
    const background = 0.1

    if (!gl) {
        throw "WebGL2 not found"
    }


    // http://www.brucelindbloom.com/index.html?Eqn_XYZ_to_RGB.html
    const conversionFunctions = `
        const vec3 white_point = vec3(94.811, 100.0, 107.304);
        const vec3 lab_range = vec3(100.0, 128.0, 128.0); 

        const float lab_e = 216.0 / 24389.0;
        const float lab_k = 24389.0 / 27.0;
        const float lab_ek = lab_e * lab_k;

        const float third = 1.0 / 3.0;
        const float tau = 6.28318530718;

        const float gamma = 2.2;
        const float inverseGamma = 1.0 / gamma;

        const mat3 srgb_to_xyz_matrix = mat3(
            0.4124564, 0.3575761, 0.1804375,
            0.2126729, 0.7151522, 0.0721750,
            0.0193339, 0.1191920, 0.9503041
        );

        const mat3 xyz_to_srgb_matrix = mat3(
            3.24045420, -1.5371385, -0.4985314,
            -0.96926600,  1.8760108,  0.0415560,
            0.05564340, -0.2040259,  1.0572252
        );

        float pow3(float vec){
            return vec * vec * vec;
        }

        float wrap(float x){
            x = fract(x);
            if (x < 0.0) 
                x += 1.0;
            return x;
        }


        // expects vec2(length, angle)
        vec2 polar_to_cartesian(vec2 polar){
            polar.y *= tau;
            return polar.x * vec2(cos(polar.y), sin(polar.y));
        }

        // returns vec2(length, angle)
        vec2 cartesian_to_polar(vec2 cartesian){
            return vec2(length(cartesian), atan(cartesian.y, cartesian.x) / tau);
        }

        vec3 rgb_to_srgb(vec3 rgb) {
            return pow(rgb, vec3(gamma));
        }

        vec3 srgb_to_rgb(vec3 rgb) {
            return pow(rgb, vec3(inverseGamma));
        }
        
        vec3 rgb_to_xyz(vec3 rgb) {
            return (rgb_to_srgb(rgb) * srgb_to_xyz_matrix) / white_point; 
        }

        vec3 xyz_to_rgb(vec3 xyz) {
            return srgb_to_rgb((xyz * white_point) * xyz_to_srgb_matrix); 
        }

        float float_to_lab(float t){
            return t > lab_e ? pow(t, third) : (lab_k * t + 16.0) / 116.0;
        }

        vec3 xyz_to_nlab(vec3 xyz) {
            vec3 f = vec3(float_to_lab(xyz.x), float_to_lab(xyz.y), float_to_lab(xyz.z));
            return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z)) / lab_range; // normalize common lab values to 0..1
        }

        vec3 nlab_to_xyz(vec3 lab) {
            lab *= lab_range;
            float fy = (lab.x + 16.0) / 116.0;
            float fz = fy - (lab.z / 200.0);
            float fx = lab.y / 500.0 + fy;
            float fx3 = pow3(fx);
            float fz3 = pow3(fz);

            return vec3(
                fx3 > lab_e ? fx3 : ((116.0 * fx - 16.0) / lab_k),
                lab.x > lab_ek ? pow3((lab.x + 16.0) / 116.0) : lab.x / lab_k,
                fz3 > lab_e ? fz3 : (116.0 * fz - 16.0) / lab_k
            );
        }

        vec3 rgb_to_lab(vec3 rgb) {
            return xyz_to_nlab(rgb_to_xyz(rgb));
        }

        vec3 lab_to_rgb(vec3 lab) {
            return xyz_to_rgb(nlab_to_xyz(lab));
        }

        vec3 rgb_to_lch(vec3 rgb) {
            vec3 lab = rgb_to_lab(rgb);
            return vec3(lab.x, cartesian_to_polar(lab.yz));
        }

        vec3 lch_to_rgb(vec3 lch) {
            return lab_to_rgb(vec3(lch.x, polar_to_cartesian(lch.yz)));
        }
    `

    const modifyLABFragment = `#version 300 es
        precision highp float;
        uniform sampler2D source; // stored as LAB colors
        
        uniform sampler2D offsetByLuminance; // unset these if not modifying?
        uniform float offsetByLuminanceFactor;

        uniform sampler2D chromaLimits;

        uniform float maxLightness;
        uniform float minLightness;
        uniform float maxChroma;

        in vec2 pixel;
        out vec4 fragColor;

        ${conversionFunctions}

        bool checker(float t, float size){
            return int(t/size) % 2 == 1;
        }

        bool check(float t){
            return t > 1.0 || t < 0.0;
        }

        float sigmoid(float x){
            return tanh(x);
        }

        float bend(float current, float amount, float min, float max){
            float target = amount > 0.0 ? max : min;
            return mix(current, target, sigmoid(abs(amount)));
        }

        void main(){
            // pixel would be outside of the image
            if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x > 1.0 || pixel.y > 1.0){
                fragColor = vec4(vec3(${background}), 1.0);
            }

            // pixel is inside the image
            else {
                vec4 src = texture(source, pixel);
                vec3 lch = rgb_to_lch(src.rgb);

                // vec3 amount = (texture(offsetByLuminance, vec2(lch.x * 16.0, 0.5)).xyz - 0.5) * offsetByLuminanceFactor; // FIXME shouldnt need *16
                // vec2 lightness_limits = texture(chromaLimits, vec2(lch.y, wrap(lch.z))).ra; // manually wrap to repeat hue circle
                // lch.x = bend(lch.x, amount.x, lightness_limits.x, lightness_limits.y);
                
                float newLightness = lch.x / (maxLightness - minLightness) - minLightness;
                lch.x = mix(lch.x, newLightness, offsetByLuminanceFactor);

                vec3 result = lch_to_rgb(lch);
                vec3 checked = checker(pixel.x + pixel.y, 0.007) ? vec3(1.0) : vec3(0.0);

                result = check(result.r) || check(result.g) || check(result.g) ? 
                    mix(src.rgb, checked, 0.8) : result;

                fragColor = vec4(result, src.a);
            }
        }
    `

    const vertex = `#version 300 es
        precision highp float;
        layout (location=0) in vec2 vertex;
        uniform vec2 viewScale; // also accounts for aspect ratio of image and canvas 
        uniform vec2 viewOffset;
        out vec2 pixel;
        
        void main() {
            pixel = (vertex * viewScale + viewOffset) * 0.5 + 0.5;
            gl_Position = vec4(vertex, 0.0, 1.0);
        }
    `

    

    const lchImageResolution = 256
    const lchImage = createTexture(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE)
    updateArrayTexture(lchImage, lchImageResolution, lchImageResolution, gl.RGBA, null)

    const tolchImage = linkProgram(
        `#version 300 es
            precision highp float;

            layout (location=0) in vec2 vertex;
            out vec2 pixel;
            
            void main() {
                pixel = vertex * 0.5 + 0.5;
                gl_Position = vec4(vertex, 0.0, 1.0);
            }
        `,

        `#version 300 es
            precision highp float;

            in vec2 pixel;
            uniform sampler2D source;
            out vec4 fragColor;

            ${conversionFunctions}

            void main(){
                vec4 src = texture(source, pixel);
                fragColor = vec4(rgb_to_lch(src.rgb), src.a);
            }
        `
    )

    const toLCHImageUniform = gl.getUniformLocation(tolchImage, "source")



    const framebuffer = gl.createFramebuffer()

    gl.clearColor(background, background, background, 1.0)

    const program = linkProgram(vertex, modifyLABFragment)
    gl.useProgram(program)

    const viewScaleUniform = gl.getUniformLocation(program, "viewScale")
    const viewOffsetUniform = gl.getUniformLocation(program, "viewOffset")

    const sourceTextureUniform = gl.getUniformLocation(program, "source")

    const luminanceOffsetMapUniform = gl.getUniformLocation(program, "offsetByLuminance")
    const luminanceOffsetFactorUniform = gl.getUniformLocation(program, "offsetByLuminanceFactor")
    
    const maxLightnessUniform = gl.getUniformLocation(program, "maxLightness")
    const minLightnessUniform = gl.getUniformLocation(program, "minLightness")
    const maxChromaUniform = gl.getUniformLocation(program, "maxChroma")

    const chromaLimitsUniform = gl.getUniformLocation(program, "chromaLimits")

    const vertexPositionAttribute =  0 // gl.getAttribLocation(program, "vertex")
    gl.enableVertexAttribArray(vertexPositionAttribute)

    // create a full-screen quad made of 2 triangles
    const vertexData = [ -1,-1,  1,-1,  1,1,    -1,-1,  1,1,  -1,1 ]
    const vertices = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.STATIC_DRAW)
    gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0)

    const xmlns = "http://www.w3.org/2000/svg"

    const curve = Array(256)

    const points = [ { x:1, y:-1, size: 0.003 } ] // [ {x:0, y:-0.3, size: 0.001}, {x:0.5, y:-0.5, size: 0.003}, {x:1, y:-1.0, size: 0.05} ]
    updateSVGFromPoints()


    const curveMap = createTexture(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE) 
    updateCurveData()


    function updateSVGFromPoints(){
        controlPoints.innerHTML = ""
        
        points
            .map(point => {
                const circle = document.createElementNS(xmlns, "circle")
                circle.setAttributeNS(null, "cx", point.x)
                circle.setAttributeNS(null, "cy", 1 - (point.y * 0.5 + 0.5))
                circle.setAttributeNS(null, "r", "0.01")
                return circle
            })
            .forEach(controlPoints.appendChild.bind(controlPoints))

        for(let index = 0; index < curve.length; index++){
            const x = index / (curve.length - 1)

            let value = 0

            for(let point of points){
                const distanceToPoint = Math.abs(x - point.x)
                const wheight = Math.pow(2, (-distanceToPoint*distanceToPoint) / point.size) // simple gaussian
                value += wheight * point.y
            }

            curve[index] = value * 0.5 + 0.5
        }

        const pathString = "M 0," + (1-(curve[0])) + " " + curve.map((y, x) => "L " + (x / (curve.length - 1)) + "," + (1-(y))).join(" ") 
        path.setAttributeNS(null, "d", pathString)
    }

    function updateCurveData(){
        const data = new Uint8Array(curve.flatMap(y => [y * 255, 127, 127, 127]))
        const width = curve.length
        const height = 1

        updateArrayTexture(curveMap, width, height, gl.RGBA, data)
    }


    // when uploaded, contains the open gl texture id
    let image = null
    let imageAspect = 1

    let maxLightness = 0.0
    let minLightness = 1.0
    let maxChroma = 0.0

    const histogram = {
        lightness: Array(256),
        chroma: Array(256),
        hue: Array(256),
    }
    
    intensity.addEventListener("input", event => {
        draw()
    })

    input.addEventListener("change", event => {
        updateSourceImageFromFile(event.target.files)
    })

    window.addEventListener("drop", event => {
        updateSourceImageFromFile(event.dataTransfer.files)
        endFileDrag(event)
    })

    window.addEventListener("dragenter", startFileDrag)
    window.addEventListener("dragstart", startFileDrag)

    window.addEventListener("dragexit", endFileDrag)

    // prevent default for ALL drag events, 
    // otherwise every drag event is ignored
    window.ondragover = event => event.preventDefault()
    window.ondrag = event => event.preventDefault()
    window.ondragend = event => event.preventDefault()
    window.ondragleave = event => event.preventDefault()

    function startFileDrag(event){
        label.classList.add("drag-over")
        event.preventDefault()
    }

    // TODO this is called while dragging but shouldn't be
    function endFileDrag(event){
        label.classList.remove("drag-over")
        event.preventDefault()
    }

    function updateSourceImageFromFile(files){
        if (files && files.length && files[0].type.startsWith("image/")){
            // thanks, HTML, for this meaningfull conversion
            const reader = new FileReader()
            reader.onload = event => updateSourceImage(event.target.result)
            reader.readAsDataURL(files[0])
        }
    }

    // also, activates and deactivates loading screen
    function updateSourceImage(src){
        loading.classList.remove("hidden")
        original.src = null

        const sourceImage = new Image()
        sourceImage.crossOrigin = '*'
        sourceImage.onload = () => {
            if (image === null) {
                image = createTexture(gl.LINEAR_MIPMAP_NEAREST, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE)  // gl.createTexture()
                document.body.classList.add("with-content")
            }
            
            imageAspect = sourceImage.width / sourceImage.height
            updateImageTexture(image, sourceImage, true)

            const pixels = renderToTexture(lchImage, lchImageResolution, lchImageResolution, () => {
                gl.useProgram(tolchImage)
                bindTexture(toLCHImageUniform, image, 0)
            }, true)

            // compute histogram
            minLightness = 255.0
            maxLightness = 0.0
            maxChroma = 0.0
            
            histogram.lightness.fill(0.0)
            histogram.chroma.fill(0.0)
            histogram.hue.fill(0.0)
            
            const pixelCount = pixels.length / 4
            for(let i = 0; i < pixels.length; i += 4){
                const [l, c, h] = [pixels[i], pixels[i + 1], pixels[i + 2]]
                histogram.lightness[Math.floor(l)] += 1.0 / pixelCount
                histogram.chroma[Math.floor(c)] += 1.0 / pixelCount
                histogram.hue[Math.floor(h)] += 1.0 / pixelCount

                minLightness = Math.min(minLightness, l)
                maxLightness = Math.max(maxLightness, l)
                maxChroma = Math.max(maxChroma, c)
            }

            maxLightness /= 255.0
            minLightness /= 255.0
            maxChroma /= 255.0

            const pathString = "M 0,1 " + histogram.lightness.map((y, x) => "L " + (x / (histogram.lightness.length - 1)) + "," + (1-(y))).join(" ") + " L 1,1"
            histogramPath.setAttributeNS(null, "d", pathString)

            draw()
            loading.classList.add("hidden")      
        }

        sourceImage.src = src
        original.src = src
    }


    // this texture is a constant and should be statically served as png
    const limitsResolution = 256 // more would exceed source image texture bit depth
    const chromaLimits /* depending on vec2(Lighntess, Hue) */ = createTexture(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE) // repeat hue, clamp lightness
    updateArrayTexture(chromaLimits, limitsResolution, limitsResolution, gl.RGBA, null)

    const computeChromaLimits = linkProgram(
        `#version 300 es
            precision highp float;

            layout (location=0) in vec2 vertex;
            out vec2 pixel;
            
            void main() {
                pixel = vertex * 0.5 + 0.5;
                gl_Position = vec4(vertex, 0.0, 1.0);
            }
        `,

        `#version 300 es
            precision highp float;

            in vec2 pixel;

            out vec4 fragColor;

            ${conversionFunctions}

            bool valid(float rgb){
                return rgb <= 1.0 && rgb >= 0.0;
            }

            bool rgb_valid(vec3 rgb){
                return valid(rgb.r) && valid(rgb.g) && valid(rgb.b);
            }

            bool lch_valid(vec3 lch){
                return rgb_valid(lch_to_rgb(lch));
            }

            // binary-search limits of RGB-gamut inside LCH space
            // chroma depending on vec2(lightness, hue)
            float max_chroma(){
                // start with approximate chroma-limit 0.5
                vec3 lch = vec3(pixel.x, 0.5, pixel.y); 
                float step = 0.25;

                for(int i = 0; i < 12; i++){
                    lch.y += lch_valid(lch)? step : -step;
                    step *= 0.5;
                }

                // possibly step back, to always be inside the gamut
                lch.y -= lch_valid(lch)? 0.0 : 1.0 / 255.0; 
                lch.y -= lch_valid(lch)? 0.0 : 1.0 / 255.0; 
                return lch.y;
            }

            // TODO: use the generated chromalimit texture to step along the border of the gamut?
            // linearly find min and max lightness of the gamut 
            // lightness depending on vec2(chroma, hue)
            vec2 min_max_lightness(){
                const int iterations = 256;
                const float step = 1.0 / (float(iterations) - 1.0);

                vec3 lch = vec3(0.0, pixel.x, pixel.y);
                float min = 0.2;
                float max = 0.8;

                bool previously_inside = false;
                float previous = 0.0;

                for(int i = 0; i < iterations; i++){
                    bool inside = lch_valid(lch);

                    if (inside && !previously_inside){
                        min = lch.x;
                    }

                    if (!inside && previously_inside){
                        max = previous;
                    }

                    previously_inside = inside;
                    previous = lch.x;
                    lch.x += step;
                }

                // possibly step back two more times, to always be inside the gamut
                return vec2(min, max);
            }

            void main(){
                vec2 lightness_limits = min_max_lightness();
                fragColor = vec4(lightness_limits.x, max_chroma(), 0.0, lightness_limits.y);
            }
        `
    )


    renderToTexture(chromaLimits, limitsResolution, limitsResolution, () => {
        gl.useProgram(computeChromaLimits)
    })


    function renderToTexture(texture, width, height, useProgram, read){
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
        gl.viewport(0,0, width, height)

        useProgram()
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
        gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 2)
        
        let result = null
        if (read){
            result = new Uint8Array(width * height * 4)
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result)
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, canvas.width, canvas.height)

        return result
    }
    






    // resize canvas and open gl if window is resized
    listen(window, "resize", () => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        gl.viewport(0, 0, canvas.width, canvas.height)
        draw()
    })

    function draw(){

        if (image === null){
            gl.clear(gl.COLOR_BUFFER_BIT)
        }
        else {
            // no need to clear, as we always redraw the whole screen
            gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
            gl.useProgram(program)
    
            const overallScale = 1.1
            const canvasAspect = canvas.width / canvas.height
            const aspect = imageAspect / canvasAspect
            const offsetX = 0 // .3 // (1 / aspect - 1) * overallScale //  / imageAspect // TOOD +1?

            // scale the image according to aspect ratio and fit it into the view
            const scale = aspect > 1? [overallScale, -overallScale * aspect] : [overallScale / aspect, -overallScale]
            gl.uniform2fv(viewScaleUniform, scale)

            gl.uniform2f(viewOffsetUniform, -offsetX, 0)

            bindTexture(sourceTextureUniform, image, 0)
            bindTexture(chromaLimitsUniform, chromaLimits, 1)
            bindTexture(luminanceOffsetMapUniform, curveMap, 2)

            console.log("intensity: " + (intensity.value * intensity.value * intensity.value))
            gl.uniform1f(luminanceOffsetFactorUniform, intensity.value * intensity.value * intensity.value)
            
            gl.uniform1f(maxLightnessUniform, maxLightness)
            gl.uniform1f(minLightnessUniform, minLightness)
            gl.uniform1f(maxChromaUniform, maxChroma)

            console.log(` minl: ${minLightness}, maxl: ${maxLightness}`)

            gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 2)
        }
    }
        

    // ### common, generic opengl functions ###


    function createTexture(min, mag, wrapX, wrapY){
        const id = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, id)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapX)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapY)
        return id
    }

    function bindTexture(uniform, texture, index){
        gl.activeTexture(gl.TEXTURE0 + index)
        gl.uniform1i(uniform, index)

        gl.bindTexture(gl.TEXTURE_2D, texture)
    }

    function updateImageTexture(id, image, mipmap){
        gl.bindTexture(gl.TEXTURE_2D, id)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
        if (mipmap) gl.generateMipmap(gl.TEXTURE_2D)
    }

    function updateArrayTexture(id, width, height, channels, data){
        gl.bindTexture(gl.TEXTURE_2D, id)
        gl.texImage2D(gl.TEXTURE_2D, 0, channels, width, height, 0, channels, gl.UNSIGNED_BYTE, data)
    }

    function linkProgram(vertex, fragment){
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertex)
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragment)

        const program = gl.createProgram()
        
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)

        gl.linkProgram(program)

        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) 
            throw "Program Link Error: " + gl.getProgramInfoLog(program)
        
        return program
    }

    function compileShader(type, source){
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) 
            throw "Shader Compile Error: " + gl.getShaderInfoLog(shader) 
                + "\n\nin\n\n" + source.split("\n").map((el, idx) => idx + ": " + el).join("\n")
        
        return shader
    }

    loading.classList.add("hidden") 
}

function listen(object, name, listener, initialEvent){
    object.addEventListener(name, listener)
    listener(initialEvent)
}
