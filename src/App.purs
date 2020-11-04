module App (ui) where

import Prelude

import Control.Monad.Except as Except
import Control.Monad.State.Class (class MonadState)
import DOM.HTML.Indexed.InputAcceptType (mediaType)
import Data.Either as Either
import Data.List as List
import Data.Maybe (Maybe(..), fromMaybe)
import Data.MediaType.Common (imageJPEG, imagePNG)
import Effect.Aff (runAff)
import Effect.Unsafe (unsafePerformEffect)
import Foreign as Foreign
import Halogen as Halogen
import Halogen.HTML as HTML
import Halogen.HTML.Events as Events
import Halogen.HTML.Properties as Props
import Web.File.File as File
import Web.File.FileReader.Aff as Reader

type Component = Halogen.Component HTML.HTML

type Input = ()

type State = 
  { image :: ImageState
  , effects :: List.List Effect
  }

initialState :: forall input. input -> State
initialState _ = 
  { image: Empty
  , effects: List.Nil
  }

data ImageState = Empty | Loading { name::String } | Loaded { name :: String, url :: String } -- , texture :: Texture
type Effect = {}

data Action = LoadImage File.File | AddEffect Effect

ui :: forall query input output effect. 
  Component query input output effect

ui =
  Halogen.mkComponent
    { initialState, render
    , eval: Halogen.mkEval $ Halogen.defaultEval { handleAction = handleAction }
    }


  -- TODO window [ Events.onDrop \files -> LoadImage <$> head files ] 

render :: forall input. State -> HTML.HTML input Action
render state = case state.image of
  Empty -> HTML.label [] -- , texture
    [ imageInput
    , HTML.div [] [ HTML.text "Click here to choose an image, or drop it anywhere on the page" ]
    ]

  Loading { name } -> HTML.text $ "Loading `" <> name <> "`"

  Loaded { name, url } -> HTML.label [] -- , texture
    [ imageInput
    , HTML.img [ Props.alt title, Props.title title, Props.src url ] 
    , HTML.div [] [ HTML.text "Click here to choose an image, or drop it anywhere on the page" ]
    ]
    where title = "The original image, `" <> name <> "`, without any effects applied"

imageInput :: forall input. HTML.HTML input Action
imageInput = HTML.input 
  [ Props.type_ Props.InputFile
  , Props.accept $ (mediaType imagePNG) <> (mediaType imageJPEG)
  , Events.onFileUpload \files -> LoadImage <$> List.head files 
  ]

handleAction :: forall m. MonadState State m => Action -> m Unit
handleAction action = case action of
  LoadImage file ->
    -- if type_ file >>= == Just $ MediaType "image/"
    do
      let name = File.name file
      Halogen.modify_ \state -> state { image = Loading { name: name } }

      -- let dataUrl = Reader.readAsDataURL $ File.toBlob file
      -- runAff (Either.either (\_err -> Empty) (\url -> Loaded { url: url, name: name })) dataUrl   -- Either.either (\_ -> Empty) (\url -> Loaded { url: url }) dataUrlStringEitherResult
      -- Halogen.modify_ \state -> state { image = image } -- , texture = texture

  AddEffect effect -> Halogen.modify_ \state -> 
    state { effects = List.Cons effect state.effects }
