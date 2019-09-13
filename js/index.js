function main(){
    const input = document.getElementById("image-input") 
    const label = document.getElementById("image-label") 
    const canvas = document.getElementById("gl")
    const loading = document.getElementById("loading")

    const gl = canvas.getContext("webgl2")
    const background = 0.1

    if (!gl) {
        throw "WebGL2 not found"
    }

    const fragment = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
        precision mediump float;
        uniform sampler2D source;
        in vec2 pixel;
        out vec4 fragColor;

        void main(){
            // pixel would be outside of the image
            if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x > 1.0 || pixel.y > 1.0){
                fragColor = vec4(vec3(${background}), 1.0);
            }

            // pixel is inside the image
            else {
                vec4 source = texture(source, pixel).rgba;
                vec3 result = source.rgb * 0.8 + 0.2;
                result.b *= 0.8;
                fragColor = vec4(result, source.a);
            }
        }
    `)
    
    const vertex = compileShader(gl.VERTEX_SHADER, `#version 300 es
        precision mediump float;
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
    
            const overallScale = 1.1
            const aspect = imageAspect / canvasAspect

            // scale the image according to aspect ratio and fit it into the view
            const scale = aspect > 1? [overallScale, -overallScale * aspect] : [overallScale / aspect, -overallScale]
            gl.uniform2fv(viewScaleUniform, scale)

            gl.uniform2f(viewOffsetUniform, 0, 0)
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
        
        return shader
    }

}

function listen(object, name, listener, initialEvent){
    object.addEventListener(name, listener)
    listener(initialEvent)
}
