module GL where

import Data.Array
import Data.Either
import Data.Map
import Data.Maybe
import Data.Unit
import Effect (Effect)
import Effect.Aff (Aff)
import Web.File.Blob (Blob)
import Data.ArrayBuffer.Types (Float32Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Uint8Array, Int8Array)
import Web.HTML (HTMLCanvasElement, HTMLImageElement, HTMLVideoElement)


type CanvasOptions =
    { premultipliedAlpha :: Boolean -- you multiplied the output color of your shaders with the output alpha (what's wrong with you?)
    , preserveDrawingBuffer :: Boolean -- do not clear the image before rendering
    , powerPreference :: PowerPreference -- @ PowerPreference
    , failIfSlow :: Boolean -- only accept hardware accelerated rendering
    , desynchronized :: Boolean -- unhinge the canvas rendering from the page rendering cycle. Might be faster but introduce tearing.
    }

data PowerPreference
    = DefaultPower
    | HighPower
    | LowPower

defaultOptions :: CanvasOptions
defaultOptions =
    { premultipliedAlpha: false
    , preserveDrawingBuffer: false
    , powerPreference: DefaultPower
    , failIfSlow: false
    , desynchronized: false
    }

-- represents one rendered frame for a whole canvas 
type Drawing =
    { shapes :: Array Shape
    , background :: Background
    , viewport :: Viewport
    
    , useAlpha :: Boolean -- allow to blend in with the page | FIXME infer from content?
    , useDepth :: Boolean -- create depth buffer
    -- , stencil :: Boolean -- create stencil buffer
    , antiAliasPreference :: Boolean -- indicate desire to reduce jagged lines
    
    -- TODO stencil and scissoring
    }

type Background =
    { color :: Maybe Vec4
    , depth :: Maybe Number
    -- , stencil :: Maybe Number
    }

type Viewport =
    { horizontal :: Range -- viewport pixel width
    , vertical :: Range -- viewport pixel height
    , depth :: Range -- depth buffer value range
    }

fullViewport :: Number -> Number -> Viewport
fullViewport width height =
    { horizontal: { start: 0.0, end: width }
    , vertical: { start: 0.0, end: height }
    , depth: { start: 0.0, end: 1.0 }
    }

type Range = { start :: Number, end :: Number }



-- represents one call to glDrawArrays or glDrawElements, including state setup
type Shape =
    { shaders :: Shaders
    , uniforms :: Uniforms
    , vertices :: Vertices
    , culling :: Culling
    , depthFunction :: DepthFunction
    , alphaBlending :: Blending
    , colorBlending :: Blending
    }

data Culling = CullBack | CullFront | CullFrontAndBack
data DepthFunction = NoDepth | LessDepth | EqualDepth | GreaterDepth | NotEqualDepth | GreaterOrEqualDepth | LessOrEqualDepth | AnyDepth

type Blending =
    { sourceFactor :: SourceBlendingFactor -- uses either glBlendFunc or glBlendFuncSeparate
    , equation :: BlendEquation -- uses either glBlendEquation or glBlendEquationSeparate
    , destinationFactor :: DestinationBlendingFactor -- uses either glBlendFunc or glBlendFuncSeparate
    }

data BlendEquation = BlendAdd | BlendSubtract | BlendReverseSubtract
data SourceBlendingFactor = BlendFromDestination | BlendFromOneMinusDestination 
    | BlendFromSourceAlphaSaturate | BlendFromUniformColor Vec4 | BlendFromUniformAlpha Number

data DestinationBlendingFactor
    = BlendToZero | BlendToOne | BlendToSource | BlendToOneMinusSource | BlendToUniformColor Vec4 -- uses glBlendColor state
    | BlendToSourceAlpha | BlendToOneMinusSourceAlpha | BlendToDestinationAlpha | BlendToOneMinusDestinationAlpha | BlendToUniformAlpha Number
    
type Shaders =
    { vertex :: ShaderSource
    , fragment :: ShaderSource
    }

type ShaderSource = String
data Precision = LowPrecision | MediumPrecision | HighPrecision
type NumberPrecision = { int :: Precision, float :: Precision }

type Vertices = 
    { attributes :: Map String VertexAttribute
    , mode :: VertexMode
    , indices :: Maybe IntBuffer -- if nothing, uses glDrawArrays, otherwise uses glDrawElements
    }

-- TODO Polygonoffset?
data VertexMode
    = PointsMode { pointSize :: Number }
    | LinesMode { lineWidth :: Number }
    | LineStripsMode { lineWidth :: Number }
    | LineLoopMode { lineWidth :: Number }
    | TrianglesMode
    | TriangleStripsMode
    | TriangleFanMode

type Uniforms = Map String Uniform

data VertexAttribute
    = NumberAttribute Float32Array -- Number
    | Vec2Attribute Float32Array -- Vec2
    | Vec3Attribute Float32Array -- Vec3
    | Vec4Attribute Float32Array -- Vec4
    
data Uniform
    = UniformBoolean Boolean -- todo boolvectors & cube map?
    | NumberUniform Number
    | Vec2Uniform Vec2
    | Vec3Uniform Vec3
    | Vec4Uniform Vec4
    | Mat3Uniform Mat3
    | Mat4Uniform Mat4
    | TextureUniform WrapTexture TextureMagnificationFilter TextureMinificationFilter Texture

type Vec2 = { x :: Number, y :: Number }
type Vec3 = { x :: Number, y :: Number, z :: Number }
type Vec4 = { x :: Number, y :: Number, z :: Number, w :: Number }

type Mat3 = 
    { a :: Number, b :: Number, c :: Number
    , d :: Number, e :: Number, f :: Number
    , g :: Number, h :: Number, i :: Number 
    }

type Mat4 =
    { a :: Number, b :: Number, c :: Number, d :: Number
    , e :: Number, f :: Number, g :: Number, h :: Number
    , i :: Number, j :: Number, k :: Number, l :: Number
    , m :: Number, n :: Number, o :: Number, p :: Number
    }

data IntBuffer
    = Int32Buffer Int32Array
    | Int16Buffer Int16Array
    | Int8Buffer Int8Array



type Texture =
    { wrap :: WrapTexture
    , magnification :: TextureMagnificationFilter
    , minification :: TextureMinificationFilter
    , data :: TextureData
    }

type WrapTexture = { horizontal :: WrapEdges, vertical :: WrapEdges }
data WrapEdges = RepeatEdges | ClampEdges | MirrorEdges

type TextureMinificationFilter = { withinLevel :: TextureFilter, betweenLevels :: TextureFilter }
type TextureMagnificationFilter = TextureFilter
data TextureFilter = NearestFilter | LinearFilter

type TextureData =
    { levels :: Levels
    , compress :: Boolean
    , generateMipMap :: Boolean
    , storageFormat :: StorageFormat
    }

data Levels 
    = SingleLevel PixelSource
    | GenerateLevels PixelSource
    | AllLevels (Array PixelSource) -- might have dimension and colortype mismatches? also only works with ArrayPixels??

data StorageFormat
    = StoreAs_L8 -- only luminance, 8 bits per sample
    | StoreAs_A1 -- only alpha, 1 bit per sample
    | StoreAs_L8_A8 -- luminance and alpha, 8 bits per channel, bytes per pixel
    | StoreAs_R5_G6_B5 -- RGB, varying bits per channel, 2 bytes per pixel
    | StoreAs_R8_G8_B8 -- RGB, 8 bits per channel, 3 bytes per pixel
    | StoreAs_R4_G4_B4_A4 -- RGBA, 4 bits per channel, 2 bytes per pixel
    | StoreAs_R5_G5_B5_A1 -- RGBA, varying bits per channel, 2 bytes per pixel
    | StoreAs_R8_G8_B8_A8 -- RGBA, 8 bits per channel, 4 bytes per pixel

data PixelSource
    = ArrayPixels Pixels
    | RenderedPixels Dimensions Drawing
    | HTMLImageElementPixels HTMLImageElement -- assumes image.src remains the same!??!?!?
    | HTMLCanvasElementPixels HTMLCanvasElement -- assumes image.src remains the same!??!?!?
    | HTMLVideoElementPixels HTMLVideoElement -- assumes image.src remains the same!??!?!?
 --   | ImageDataPixels ImageData
 --   | ImageBitmapPixels ImageBitmap

type Dimensions = { width :: Int, height :: Int }
-- data ColorType = Gray | RGB | RGBA -- inferred from dimensions and array length

type Pixels = 
    { dimensions :: Dimensions
    , values :: PixelArray
    , flippedY :: Boolean
    , premultipliedAlpha :: Boolean
    , convertedColorspace :: Boolean
    -- , alignment :: ByteAlignment -- TODO should be calculated from dimension & internalformat/arraytype?
    }

data PixelArray
    = FloatArrayPixels Float32Array
    | Uint8ArrayPixels Uint8Array
    | Uint16ArrayPixels Uint16Array
    | Uint32ArrayPixels Uint32Array

data ByteAlignment = Align1Byte | Align2Bytes | Align4Bytes | Align8Bytes


-- data PixelFormat = DepthPixelFormat | AlphaPixelFormat | RgbPixelFormat | RgbaPixelFormat | LuminancePixelFormat | AlphaPixelFormat


newtype RenderError = RenderError String
type RenderResult = Either RenderError


foreign import renderWithOptions :: CanvasOptions -> HTMLCanvasElement -> Drawing -> RenderResult (Effect Unit)
foreign import renderBlob :: Drawing -> RenderResult Blob -- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
-- foreign import cleanup :: () -> Effect Unit
-- foreign import drawToBitmap :: Drawing -> Effect (Either Error ImageBitmap) -- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas


render :: HTMLCanvasElement -> Drawing -> RenderResult (Effect Unit)
render = renderWithOptions defaultOptions
