function main(){
    const input = document.getElementById("image-input") 
    const label = document.getElementById("image-label") 
    const canvas = document.getElementById("gl")
    const loading = document.getElementById("loading")
    const original = document.getElementById("original")

    const gl = canvas.getContext("webgl2")
    const background = 0.1

    if (!gl) {
        throw "WebGL2 not found"
    }


    const conversionFunctions = `
    vec3 rgb_to_srgb(vec3 rgb) {
        return pow(rgb, vec3(2.2));
    }

    vec3 srgb_to_rgb(vec3 rgb) {
        return pow(rgb, vec3(1.0 / 2.2));
    }
    
    vec3 rgb_to_xyz(vec3 rgb) {
        vec3 srgb = rgb_to_srgb(rgb);

        vec3 xyz = vec3( // TODO make this a matrix multiplication?
            0.4124564 * srgb.r + 0.3575761 * srgb.g + 0.1804375 * srgb.b,
            0.2126729 * srgb.r + 0.7151522 * srgb.g + 0.0721750 * srgb.b,
            0.0193339 * srgb.r + 0.1191920 * srgb.g + 0.9503041 * srgb.b
        );

        return xyz / vec3(94.811, 100.0, 107.304);
    }

    vec3 xyz_to_rgb(vec3 xyz) {
        xyz *= vec3(94.811, 100.0, 107.304);

        // TODO companding?  see http://www.brucelindbloom.com/index.html?Eqn_XYZ_to_RGB.html
        return srgb_to_rgb(vec3(  // TODO make this a matrix multiplication?
            3.24045420 * xyz.x - 1.5371385 * xyz.y - 0.4985314 * xyz.z,
            -0.9692660 * xyz.x + 1.8760108 * xyz.y + 0.0415560 * xyz.z,
            0.05564340 * xyz.x - 0.2040259 * xyz.y + 1.0572252 * xyz.z
        ));
    }

    vec3 xyz_to_lab(vec3 xyz) {
        float e = 216.0 / 24389.0;
        float k = 24389.0 / 27.0;
        float thrd = 1.0 / 3.0;

        float fx = xyz.x > e ? pow(xyz.x, thrd) : (k*xyz.x + 16.0) / 116.0;
        float fy = xyz.y > e ? pow(xyz.y, thrd) : (k*xyz.y + 16.0) / 116.0;
        float fz = xyz.z > e ? pow(xyz.z, thrd) : (k*xyz.z + 16.0) / 116.0;

        return vec3(
            166.0 * fy - 16.0,
            500.0 * (fx - fy),
            200.0 * (fy - fz)
        );
    }

    vec3 lab_to_xyz(vec3 lab) {
        float e = 216.0 / 24389.0;
        float k = 24389.0 / 27.0;
        float l = lab.x;
        float a = lab.y;
        float b = lab.z;

        // http://www.brucelindbloom.com/index.html?Eqn_Lab_to_XYZ.html
        float fy = (l + 16.0) / 166.0;
        float fz = fy - (b / 200.0);
        float fx = a / 500.0 + fy;

        float fxp3 = pow(fx, 3.0);
        float fzp3 = pow(fz, 3.0);

        return vec3(
            fxp3 > e ? fxp3 : (116.0 * fx - 16.0) / k,
            l > k*e ? pow((l + 16.0) / 116.0, 3.0) : l / k,
            fzp3 > e ? fzp3 : (116.0 * fz - 16.0) / k
        );
    }

    vec3 rgb_to_lab(vec3 rgb) {
        // return xyz_to_lab(rgb_to_xyz(rgb));
        return rgb_to_xyz(rgb);
    }

    vec3 lab_to_rgb(vec3 lab) {
        // return xyz_to_rgb(lab_to_xyz(lab));
        return xyz_to_rgb(lab);
    }
    `

    const fragment = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform sampler2D source; // TODO store as LAB colors
    
    uniform sampler2D offsetByLuminance; // unset these if not modifying?

    in vec2 pixel;
    out vec4 fragColor;

    ${conversionFunctions}

    void main(){
        // pixel would be outside of the image
        if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x > 1.0 || pixel.y > 1.0){
            fragColor = vec4(vec3(${background}), 1.0);
        }

        // pixel is inside the image
        else {
            vec4 sourcePixel = texture(source, pixel);
            vec3 lab = rgb_to_lab(sourcePixel.rgb);

            // float luminance = lab.y;
            // lab += texture(offsetByLuminance, vec2(luminance, 0.5)).xyz;

            fragColor = vec4(lab_to_rgb(lab), sourcePixel.a); // TODO alpha curves?
        }
    }
    `)
    
    const vertex = compileShader(gl.VERTEX_SHADER, `#version 300 es
    precision highp float;
    in vec2 vertex;
    uniform vec2 viewScale; // also accounts for aspect ratio of image and canvas 
    uniform vec2 viewOffset;
    out vec2 pixel;
    
    void main() {
        pixel = (vertex * viewScale + viewOffset) * 0.5 + 0.5;
        gl_Position = vec4(vertex, 0.0, 1.0);
    }
    `)

    gl.clearColor(background, background, background, 1.0)

    const program = linkProgram(vertex, fragment)
    gl.useProgram(program)

    const viewScaleUniform = gl.getUniformLocation(program, "viewScale")
    const viewOffsetUniform = gl.getUniformLocation(program, "viewOffset")

    const vertexPositionAttribute = gl.getAttribLocation(program, "vertex")
    gl.enableVertexAttribArray(vertexPositionAttribute)

    // create a full-screen quad made of 2 triangles
    const vertexData = [ -1,-1,  1,-1,  1,1,    -1,-1,  1,1,  -1,1 ]
    const vertices = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.STATIC_DRAW)
    gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0)


    // when uploaded, contains the open gl texture id
    let image = null
    let imageAspect = 1
    let canvasAspect = 1
    
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
                image = gl.createTexture()
                document.body.classList.add("with-content")
            }
            
            gl.bindTexture(gl.TEXTURE_2D, image)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, sourceImage)

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST)
            gl.generateMipmap(gl.TEXTURE_2D)

            imageAspect = sourceImage.width / sourceImage.height

            draw()
            loading.classList.add("hidden")        
        }

        sourceImage.src = src
        original.src = src
    }

    // resize canvas and open gl if window is resized
    listen(window, "resize", () => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        canvasAspect = canvas.width / canvas.height
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
            gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0)
            gl.useProgram(program)
    
            const overallScale = 1.5
            const aspect = imageAspect / canvasAspect
            const offsetX = 0.3 // (1 / aspect - 1) * overallScale //  / imageAspect // TOOD +1?

            // scale the image according to aspect ratio and fit it into the view
            const scale = aspect > 1? [overallScale, -overallScale * aspect] : [overallScale / aspect, -overallScale]
            gl.uniform2fv(viewScaleUniform, scale)

            gl.uniform2f(viewOffsetUniform, -offsetX, 0)
            gl.bindTexture(gl.TEXTURE_2D, image)
            
            gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 2)
        }
    }
        

    // ### common, generic opengl functions ###

    function linkProgram(vertex, fragment){
        const program = gl.createProgram()
        gl.attachShader(program, vertex)
        gl.attachShader(program, fragment)
        gl.linkProgram(program)

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

}

function listen(object, name, listener, initialEvent){
    object.addEventListener(name, listener)
    listener(initialEvent)
}
