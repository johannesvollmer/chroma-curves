module App (ui) where

import Prelude

import Control.Monad.State.Class (class MonadState)
import Data.Maybe (Maybe(..))
import Halogen as Halogen
import Halogen.HTML as HTML
import Halogen.HTML.Events as Events

type Component = Halogen.Component HTML.HTML


type Input = ()
type State = Int
data Action = Increment | Decrement

ui :: forall query input output effect. 
  Component query input output effect

ui =
  Halogen.mkComponent
    { initialState, render
    , eval: Halogen.mkEval $ Halogen.defaultEval { handleAction = handleAction }
    }

initialState :: forall input. input -> Int
initialState _ = 0

render :: forall state input. Show state => 
  state -> HTML.HTML input Action

render state =
  HTML.div []
    [ HTML.button [ Events.onClick \_ -> Just Decrement ] [ HTML.text "-" ]
    , HTML.div [] [ HTML.text $ show state ]
    , HTML.button [ Events.onClick \_ -> Just Increment ] [ HTML.text "+++" ]
    ]

handleAction :: forall m. MonadState Int m => Action -> m Unit
handleAction action = Halogen.modify_ $ \state -> case action of
  Increment -> state + 1
  Decrement -> state - 1
