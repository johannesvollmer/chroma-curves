module App (ui) where

import Prelude

import Data.Maybe (Maybe(..))
import Halogen as Halogen
import Halogen.HTML (button, HTML, text, div_)
import Halogen.HTML.Events as Events


data Action = Increment | Decrement

ui :: forall t37 t38 t59 t62. Halogen.Component HTML t62 t59 t38 t37
ui =
  Halogen.mkComponent
    { initialState
    , render
    , eval: Halogen.mkEval $ Halogen.defaultEval { handleAction = handleAction } -- boilerplate??
    }

-- initialState :: forall t26. t26 -> Int
initialState _ = 0

-- render :: forall t17 t3. Show t17 => t17 -> HTML t3 Action
render state =
  div_
    [ button [ Events.onClick \_ -> Just Decrement ] [ text "-" ]
    , div_ [ text $ show state ]
    , button [ Events.onClick \_ -> Just Increment ] [ text "+++" ]
    ]

-- handleAction :: forall t30. MonadState Int t30 => Action -> t30 Unit
handleAction = case _ of
  Increment -> Halogen.modify_ \state -> state + 1
  Decrement -> Halogen.modify_ \state -> state - 1