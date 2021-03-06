function main(){
    const ids = {
        input: "image-input",
        label: "image-label",
        canvas: "gl",
        loading: "loading",
        original: "original",
        path: "curve-path",
        controlPoints: "control-points",
        intensity: "intensity-slider",
        intensityLabel: "intensity-label",
        exposure: "exposure-checkbox",
        showGamutBorder: "gamut-border-checkbox",
        histogramPath: "histogram-path",
        reset: "reset-curve",
        preDithering: "pre-dithering-slider",
        preDitheringLabel: "pre-dithering-label"
    }

    for(let name in ids)
        this[name] = document.getElementById(ids[name]) // aww yisss


    window.gl = canvas.getContext("webgl2")
    const background = 0.1

    if (!gl) {
        throw "WebGL2 not found"
    }


    const lchImageResolution = 256
    const lchImage = createTexture(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE)
    updateArrayTexture(lchImage, lchImageResolution, lchImageResolution, gl.RGBA, null)


    const convertRGBTextureToLCH = shaders.convertRGBTexturetoLCH()
    const computeGamutLimits = shaders.computeGamutLimits()
    
    const framebuffer = gl.createFramebuffer()

    gl.clearColor(background, background, background, 1.0)

    const program = shaders.render({ background })

    const vertexPositionAttribute =  0 // fixed layout instead of gl.getAttribLocation(program, "vertex")
    gl.enableVertexAttribArray(vertexPositionAttribute)

    // create a full-screen quad made of 2 triangles
    const vertexData = [ -1,-1,  1,-1,  1,1,    -1,-1,  1,1,  -1,1 ]
    const vertices = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.STATIC_DRAW)
    gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0)

    const xmlns = "http://www.w3.org/2000/svg"

    const curve = Array(Math.floor(256/1.5))

    const points = [ { x: 0.8, y: -0.8, size: 0.003 } ] // [ {x:0, y:-0.3, size: 0.001}, {x:0.5, y:-0.5, size: 0.003}, {x:1, y:-1.0, size: 0.05} ]
    let currentControlPointIndex = null
    updateSVGFromPoints()


    const curveMap = createTexture(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE) 
    updateCurveData()


    function updateSVGFromPoints(){
        controlPoints.innerHTML = ""
        
        points
            .map((point, index) => {
                console.log(index)
                const circle = document.createElementNS(xmlns, "circle")
                circle.setAttributeNS(null, "cx", point.x)
                circle.setAttributeNS(null, "cy", 1 - (point.y * 0.5 + 0.5))
                circle.setAttributeNS(null, "r", "0.01")
                circle.addEventListener("mousedown", event => {
                    currentControlPointIndex = index
                })
                return circle
            })
            .forEach(controlPoints.appendChild.bind(controlPoints))


        console.log(controlPoints)    

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
    let maxRGB = 0

    const histogram = {
        lightness: Array(256),
        chroma: Array(256),
        hue: Array(256),
        maxLightnessCount: 0.0,
        maxChromaCount: 0.0,
        maxHueCount: 0.0
    }


    
    document.addEventListener("mouseup", event => {
        currentControlPointIndex = null
    })
    document.addEventListener("mousemove", event => {
        if (currentControlPointIndex !== null){
            const lolX = 6
            const lolY = 2
            points[currentControlPointIndex].x += lolX * event.movementX / window.innerWidth
            points[currentControlPointIndex].y -= lolY * event.movementY / window.innerHeight
            updateSVGFromPoints()
            updateCurveData()
            draw()
        }
    })


    
    intensityLabel.innerHTML = intensity.value
    reset.addEventListener("click", () => {
        intensity.value = 0.0
        intensityLabel.innerHTML = intensity.value
        draw()
    })
    
    intensity.addEventListener("input", () => {
        intensityLabel.innerHTML = intensity.value
        draw()
    })
    
    preDitheringLabel.innerHTML = preDithering.value
    preDithering.addEventListener("input", () => {
        preDitheringLabel.innerHTML = preDithering.value
        draw()
    })

    exposure.addEventListener("change", draw)
    showGamutBorder.addEventListener("change", draw)

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
                convertRGBTextureToLCH.bind({
                    source: image
                }) 
            }, true)

            // compute histogram
            histogram.lightness.fill(0.0)
            histogram.chroma.fill(0.0)
            histogram.hue.fill(0.0)
            
            // FIXME histogram should respect "auto exposure"
            const pixelCount = pixels.length / 4
            for(let i = 0; i < pixels.length; i += 4){
                const [l, c, h] = [pixels[i], pixels[i + 1], pixels[i + 2]]
                histogram.lightness[Math.floor(l)] += 1.0 / pixelCount
                histogram.chroma[Math.floor(c)] += 1.0 / pixelCount
                histogram.hue[Math.floor(h)] += 1.0 / pixelCount
            }

            histogram.maxLightnessCount = Math.max(...histogram.lightness)
            histogram.maxChromaCount = Math.max(...histogram.chroma)
            histogram.maxHueCount = Math.max(...histogram.hue)

            // downscale rgb image
            const canvas = document.createElement("canvas")
            const rgbResolution = Math.min(256, (sourceImage.width + sourceImage.height) / 2.0)

            canvas.width = rgbResolution
            canvas.height = rgbResolution
            const context = canvas.getContext("2d")
            context.drawImage(sourceImage, 0, 0, rgbResolution, rgbResolution)
            const rgbPixels = context.getImageData(0, 0, rgbResolution, rgbResolution).data
            
            maxRGB = 0
            for(let i = 0; i < rgbPixels.length; i += 4){
                const [r, g, b] = [rgbPixels[i], rgbPixels[i + 1], rgbPixels[i + 2]]
                maxRGB = Math.max(Math.max(Math.max(maxRGB, b), g), r)
            }
            
            //exposure.disabled = (maxRGB == 255)
            //if (maxRGB == 255) exposure.checked = false

            // convert ImageData srgb to OpenGL linear
            maxRGB = Math.pow(maxRGB / 255, 1.0 / 2.2)

            const pathString = "M 0,1 " + histogram.lightness.map((y, x) => "L " + (x / (histogram.lightness.length - 1)) + "," + (1-(0.9 * y / histogram.maxLightnessCount))).join(" ") + " L 1,1"
            histogramPath.setAttributeNS(null, "d", pathString)

            draw()
            loading.classList.add("hidden")      
        }

        sourceImage.src = src
        original.src = src
    }




    function updateHistogramCurve(){

    }


    // this texture is a constant and should be statically served as png
    const limitsResolution = 256 // more would exceed source image texture bit depth
    const chromaLimits /* depending on vec2(Lighntess, Hue) */ = createTexture(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE) // repeat hue, clamp lightness
    updateArrayTexture(chromaLimits, limitsResolution, limitsResolution, gl.RGBA, null)


    renderToTexture(chromaLimits, limitsResolution, limitsResolution, () => {
        // gl.useProgram(computeChromaLimits)
        computeGamutLimits.bind({})
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
            
            // gl.useProgram(program)
    
            const overallScale = 1.1
            const canvasAspect = canvas.width / canvas.height
            const aspect = imageAspect / canvasAspect
            const offsetX = 0 // .3 // (1 / aspect - 1) * overallScale //  / imageAspect // TOOD +1?

            // scale the image according to aspect ratio and fit it into the view
            const scale = aspect > 1? [overallScale, -overallScale * aspect] : [overallScale / aspect, -overallScale]

            
            program.bind({
                viewScale: scale,
                viewOffset: [-offsetX, 0],

                source: image,
                chromaLimits: chromaLimits,

                offsetByLuminance: curveMap,
                offsetByLuminanceFactor: intensity.value,

                preDithering: preDithering.value == 0? 0 : 1.0 / Math.pow(2, preDithering.value),
                showGamutBorder: showGamutBorder.checked? 1 : 0,

                exposure: exposure.checked? 1.0 / maxRGB : 1 
            })

            gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 2)
        }
    }

    loading.classList.add("hidden") 
}

function listen(object, name, listener, initialEvent){
    object.addEventListener(name, listener)
    listener(initialEvent)
}
