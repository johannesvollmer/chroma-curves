{-
Welcome to a Spago project!
You can edit this file as you like.
-}
{ name = "clab"
, dependencies =
  [ "console", "effect", "halogen", "halogen-css", "psci-support" ]
, packages = ./packages.dhall
, sources = [ "src/**/*.purs", "test/**/*.purs" ]
}
