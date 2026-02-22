{
    description = "OpenClaw Core Development Environment";
    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
        flake-utils.url = "github:numtide/flake-utils";
    };
    outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
        let
            pkgs = import nixpkgs { inherit system; };
            ghcVersion = "9.8.2";
        in {
            devShells.default = pkgs.mkShell {
                buildInputs = [
                    pkgs.haskell.packages.ghc98.ghc
                    pkgs.haskell.packages.ghc98.cabal-install
                    pkgs.nodejs_22
                ];
            };
        }
    );
}