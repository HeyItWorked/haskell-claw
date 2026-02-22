{-# LANGUAGE OverloadedStrings #-}

module Main where

import Control.Exception (bracket, finally)
import Control.Monad (forever, when)
import Data.Aeson (decode, encode, Value(..), Object, object, (.=))
import qualified Data.Aeson.KeyMap as KeyMap  -- For Aeson 2.0+ JSON object access
import Data.Scientific (Scientific)           -- For Number type from Aeson
import Data.ByteString.Lazy (ByteString)
import qualified Data.ByteString.Lazy.Char8 as BL
import Network.Socket
import Network.Socket.ByteString.Lazy (recv, sendAll)
import System.Directory (removeFile)
import System.IO (hPutStrLn, stderr)
import System.Exit (exitSuccess)

socketPath :: String
socketPath = "/tmp/openclaw-core.sock"

-- Process a single JSON line
processLine :: ByteString -> IO (Maybe ByteString)
processLine line = do
  let maybeJson = decode line :: Maybe Value
  case maybeJson of
    Just (Object obj) -> do
      -- Use KeyMap.lookup instead of lookup for newer Aeson versions
      case KeyMap.lookup "ping" obj of
        Just (Number n) | n == 1 -> return $ Just $ encode $ object ["pong" .= (1 :: Int)]
        _ -> return Nothing
    _ -> return Nothing

-- Handle a single client connection
handleClient :: Socket -> IO ()
handleClient sock = do
  let maxBytes = 4096
  forever $ do
    msg <- recv sock maxBytes
    when (BL.null msg) exitSuccess  -- Connection closed
    
    response <- processLine msg
    case response of
      Just r -> sendAll sock (r `BL.append` "\n")
      Nothing -> return ()

main :: IO ()
main = do
  -- Clean up socket if it exists from a previous run
  bracket
    (socket AF_UNIX Stream defaultProtocol)
    close
    (\sock -> do
        -- Set up the socket
        bind sock (SockAddrUnix socketPath)
        listen sock 1
        hPutStrLn stderr $ "Listening on " ++ socketPath
        
        -- Accept one connection and handle it
        (conn, _) <- accept sock
        handleClient conn `finally` removeFile socketPath
    )