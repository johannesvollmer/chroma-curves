module App (ui) where

import Halogen.HTML.CSS
import Prelude

import Control.Alt ((<|>))
import DOM.HTML.Indexed.InputAcceptType (extension, mediaType)
import Data.List as List
import Data.MediaType.Common (imageJPEG, imagePNG)
import Effect.Aff.Class (class MonadAff)
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
  , effects :: List.List ImageEffect
  }

initialState :: forall input. input -> State
initialState _ = 
  { image: NoImage
  , effects: List.Nil
  }

data ImageState = NoImage | LoadingImage { name::String } | LoadedImage { name :: String, url :: String } -- , texture :: Texture
type ImageEffect = {}

data Action = LoadImage File.File | AddEffect ImageEffect

ui :: forall query input output effect. MonadAff effect =>
  Component query input output effect

ui =
  Halogen.mkComponent
    { initialState, render
    , eval: Halogen.mkEval $ Halogen.defaultEval { handleAction = handleAction }
    }


-- TODO window [ Events.onDrop \files -> LoadImage <$> head files ] 
render :: forall input. State -> HTML.HTML input Action
render state = case state.image of
  NoImage -> HTML.label [] -- , texture
    [ imageInput
    , HTML.div [] [ HTML.text "Click here to choose an image, or drop it anywhere on the page" ]
    ]

  LoadingImage { name } -> HTML.text $ "Loading `" <> name <> "`"

  LoadedImage { name, url } -> HTML.label [] -- , texture
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

handleAction :: forall output result. MonadAff result => Action -> Halogen.HalogenM State Action () output result Unit
handleAction action = case action of
  LoadImage file ->
    let name = File.name file in do
      Halogen.modify_ _ { image = LoadingImage { name: name } }
      let dataUrlReader = Reader.readAsDataURL $ File.toBlob file
      let imageFromUrl dataUrlString = LoadedImage { url: dataUrlString, name: name }
      image <- Halogen.liftAff $ (imageFromUrl <$> dataUrlReader) <|> pure NoImage
      Halogen.modify_ _ { image = image } -- , texture = texture

  AddEffect effect -> Halogen.modify_ \state -> 
    state { effects = List.Cons effect state.effects }
