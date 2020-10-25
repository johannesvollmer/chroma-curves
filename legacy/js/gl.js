

function createProgram({ vertex, fragment, uniforms }){
    const id = linkProgram(vertex, fragment)

    const bindUniform = {}
    let textureSlot = 0

    for (let uniform in uniforms){
        const location = gl.getUniformLocation(id, uniform)
        const update = uniforms[uniform]

        if (update === window.gl.bindTexture){
            const slot = textureSlot++
            const location = gl.getUniformLocation(id, uniform)
            bindUniform[uniform] = value => bindTexture(location, value, slot) 
        }

        else bindUniform[uniform] = value => update.call(gl, location, value)
    }
        
    return {
        bind: uniformValues => {
            gl.useProgram(id)

            for (uniform in uniformValues) {
                if (!bindUniform[uniform]) 
                    throw "Uniform " + uniform + " does not exist"

                const update = bindUniform[uniform]
                update.call(gl, uniformValues[uniform])
            }
        },
    }
}

function bindTexture(uniform, texture, index){
    gl.activeTexture(gl.TEXTURE0 + index)
    gl.uniform1i(uniform, index)

    gl.bindTexture(gl.TEXTURE_2D, texture)
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

function createTexture(min, mag, wrapX, wrapY){
    const id = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, id)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapX)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapY)
    return id
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