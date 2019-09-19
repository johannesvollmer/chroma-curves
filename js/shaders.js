window.shaders = {}

// http://www.brucelindbloom.com/index.html?Eqn_XYZ_to_RGB.html

const math = `
    const vec3 white_point = vec3(94.811, 100.0, 107.304); // vec3(31595.0, 32768.0, 27030.0) / 32768.0;
    const vec3 lab_range = vec3(100.0 / 11.0, 128.0, 128.0); // FIXME why / 11.0????

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

    float pow3(float number){
        return number * number * number;
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
        return vec2(length(cartesian), wrap(atan(cartesian.y, cartesian.x) / tau));
    }

    vec3 rgb_to_srgb(vec3 rgb) {
        return pow(max(rgb, vec3(0.0)), vec3(gamma));
    }

    vec3 srgb_to_rgb(vec3 rgb) {
        return pow(max(rgb, vec3(0.0)), vec3(inverseGamma));
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
        return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z)) / lab_range; 
    }

    vec3 nlab_to_xyz(vec3 lab) {
        lab *= lab_range; // denormalize common lab values from 0..1
        float fy = (lab.x + 16.0) / 116.0;
        float fz = fy - (lab.z / 200.0);
        float fx = lab.y / 500.0 + fy;
        float fx3 = pow3(fx);
        float fy3 = pow3(fy);
        float fz3 = pow3(fz);

        return vec3(
            fx3 > lab_e ? fx3 : ((116.0 * fx - 16.0) / lab_k),
            lab.x > lab_ek ? fy3 : lab.x / lab_k,
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





window.shaders.render = ({ background }) => createProgram({
    uniforms: {
        source: gl.bindTexture,
        offsetByLuminance: gl.bindTexture,
        chromaLimits: gl.bindTexture,

        offsetByLuminanceFactor: gl.uniform1f,
        exposure: gl.uniform1f,
        preDithering: gl.uniform1f,

        showGamutBorder: gl.uniform1i,

        viewScale: gl.uniform2fv,
        viewOffset: gl.uniform2fv
    },

    vertex: `#version 300 es
        precision highp float;
        layout (location=0) in vec2 vertex;
        uniform vec2 viewScale; // also accounts for aspect ratio of image and canvas 
        uniform vec2 viewOffset;
        out vec2 pixel;
        
        void main() {
            pixel = (vertex * viewScale + viewOffset) * 0.5 + 0.5;
            gl_Position = vec4(vertex, 0.0, 1.0);
        }
    `,

    fragment: `#version 300 es
        precision highp float;
        uniform sampler2D source; // stored as LAB colors
        
        uniform sampler2D offsetByLuminance; // unset these if not modifying?
        uniform float offsetByLuminanceFactor;

        uniform sampler2D chromaLimits;

        uniform float exposure;
        uniform float preDithering;

        uniform bool showGamutBorder;

        in vec2 pixel;
        out vec4 fragColor;

        const vec3 background = vec3(${background});

        ${math}

        bool checker(float t, float size){
            return int(t/size) % 2 == 1;
        }

        bool out_of_range(float t){
            return isnan(t) || t > 1.0001 || t < 0.0001;
        }

        float sigmoid_01(float x){
            return clamp(tanh(x) * 0.5 + 0.5, 0.0, 1.0);
        }

        // shift a value, ensuring it never goes out of [0,1]
        // value y should be inside [0,1]
        // https://www.wolframalpha.com/input/?i=invert+%28tanh%28x%29*0.5%2B0.5%29
        float inverse_sigmoid_01(float y){
            return atanh(2.0 * clamp(y, 0.0, 1.0) - 1.0);
        }

        float smooth_shift_01(float t, float shift){ 
            return sigmoid_01(inverse_sigmoid_01(t) + shift);
        }

        /*float bend(float current, float amount, float min, float max){
            float target = amount > 0.0 ? max : min;
            return mix(current, target, sigmoid_n1_1(abs(amount)));
        }*/

        float noise1(vec2 coordinate){
            return fract(sin(
                dot(
                    coordinate.xy,
                    vec2(12.9898,78.233)
                ))
                * 43758.5453123
            );
        }
        
        vec3 noise3(vec2 coordinate){
            return vec3(noise1(coordinate), noise1(coordinate*0.9), noise1(coordinate*1.1));
        }

        float getMaxChroma(float lightness, float hue){
            return texture(chromaLimits, vec2(lightness, wrap(hue))).y;
        }

        vec3 adjustLightnessForRelativeChroma(vec3 lch, float lightness){
            // float oldMaxChroma = getMaxChroma(lch.x, lch.z);
            float newMaxChroma = getMaxChroma(lightness, lch.z);
            // return vec3(lightness, (lch.y / oldMaxChroma) * newMaxChroma, lch.z);
            return vec3(lightness, min(lch.y, newMaxChroma * 0.98), lch.z); // TODO
        }

        bool rgb_out_of_range(vec3 rgb){
            return out_of_range(rgb.r) || out_of_range(rgb.g) || out_of_range(rgb.b);
        }

        bool lch_out_of_range(vec3 lch){
            return out_of_range(lch.x) || out_of_range(lch.y);
        }

        void main(){
            // pixel would be outside of the image
            if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x > 1.0 || pixel.y > 1.0){
                fragColor = vec4(background, 1.0);
            }

            // pixel is inside the image
            else {
                vec4 src = texture(source, pixel); // this is in linear rgb color space
                src.rgb = clamp(src.rgb + (noise3(pixel) - 0.5) * preDithering, 0.0, 1.0); // dither before any adjustments at all 

                vec3 lch = rgb_to_lch(exposure * src.rgb); // FIXME why multiply with that vector??? 

                // vec3 amount = (texture(offsetByLuminance, vec2(lch.x, 0.5)).xyz - 0.5) * offsetByLuminanceFactor;
                vec2 lightness_limits = texture(chromaLimits, vec2(lch.y, wrap(lch.z))).ra; // manually wrap to repeat hue circle
                // lch.x = bend(lch.x, amount.x, lightness_limits.x, lightness_limits.y);
                
                // float newLightness = mix(lch.x, 1.0, offsetByLuminanceFactor);
                // lch = adjustLightnessForRelativeChroma(lch, newLightness);
                
                // float brighten = pow(2.0, offsetByLuminanceFactor * 5.0);
                // lch.x = pow(lch.x, 1.0 / brighten);


                float normalized = (lch.x - lightness_limits.x) / (lightness_limits.y - lightness_limits.x);
                float adjusted = pow(max(0.0, normalized), pow(2.0, -offsetByLuminanceFactor * 5.0));
                float denormalized = adjusted * (lightness_limits.y - lightness_limits.x) + lightness_limits.x;
                lch = adjustLightnessForRelativeChroma(lch, denormalized);

                //lch.x =  smooth_shift_01(lch.x, offsetByLuminanceFactor);
                

                vec3 result = lch_to_rgb(lch);
                // vec3 result = vec3(pow(lch.x, 1.0 / 2.2));
                
                if (showGamutBorder){
                    vec3 diagonals = checker(pixel.x + pixel.y, 0.007) ? vec3(1.0) : vec3(0.0);
                    result = rgb_out_of_range(result) || lch_out_of_range(lch) ? diagonals : result;
                }

                result = clamp(result, 0.0, 1.0);
                fragColor = vec4(mix(background, result, src.a), 1.0);
            }
        }
    `
})



window.shaders.computeGamutLimits = () => createProgram({
    uniforms: {},

    vertex: `#version 300 es
        precision highp float;

        layout (location=0) in vec2 vertex;
        out vec2 pixel;
        
        void main() {
            pixel = vertex * 0.5 + 0.5;
            gl_Position = vec4(vertex, 0.0, 1.0);
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec2 pixel;

        out vec4 fragColor;

        ${math}

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
})

window.shaders.convertRGBTexturetoLCH = () => createProgram({
    vertex: `#version 300 es
        precision highp float;

        layout (location=0) in vec2 vertex;
        out vec2 pixel;
        
        void main() {
            pixel = vertex * 0.5 + 0.5;
            gl_Position = vec4(vertex, 0.0, 1.0);
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec2 pixel;
        uniform sampler2D source;
        out vec4 fragColor;

        ${math}

        void main(){
            vec4 src = texture(source, pixel);
            fragColor = vec4(rgb_to_lch(src.rgb), src.a);
        }
    `,

    uniforms: {
        source: window.gl.bindTexture
    },
})


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