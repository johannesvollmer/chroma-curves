module Main where

import Prelude 
import Halogen.Aff as Halogen
import Halogen.VDom.Driver as VirtualDom
import Effect (Effect)
import App as App

main :: Effect Unit
main = Halogen.runHalogenAff do
  body <- Halogen.awaitBody
  VirtualDom.runUI App.ui unit body

