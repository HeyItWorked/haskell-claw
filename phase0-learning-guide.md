# OpenClaw Phase 0 Learning Guide

This guide walks through implementing Phase 0 of OpenClaw, explaining each component, file, and step in detail.

## Table of Contents

- [Overview](#overview)
- [Step 1: Set up GHCup and Haskell Environment](#step-1-set-up-ghcup-and-haskell-environment)
- [Step 2: Create the Haskell Core Component](#step-2-create-the-haskell-core-component)
- [Step 3: Implement the Nix Development Environment](#step-3-implement-the-nix-development-environment) 
- [Step 4: Upgrade to Unix Domain Socket Communication](#step-4-upgrade-to-unix-domain-socket-communication)
- [Step 5: Create the TypeScript Core Supervisor](#step-5-create-the-typescript-core-supervisor)
- [Step 6: Implement the Benchmark Tests](#step-6-implement-the-benchmark-tests)
- [Step 7: Set Up GitHub Actions CI Workflow](#step-7-set-up-github-actions-ci-workflow)
- [Step 8: Configure Cachix for Faster CI Builds](#step-8-configure-cachix-for-faster-ci-builds)
- [Learning Resources](#learning-resources)
- [Glossary of Terms](#glossary-of-terms)

## Overview

**Phase 0 Goal:** Establish a bidirectional communication pipeline between a Node.js application and a Haskell binary using Unix Domain Sockets (UDS), with performance benchmarks and CI integration.

This phase creates the technical foundation for the entire project:
- A Haskell binary that processes commands
- A Node.js supervisor that manages the Haskell process
- Ultra-fast IPC (Inter-Process Communication) using UDS
- Automated testing and continuous integration

## Step 1: Set up GHCup and Haskell Environment

### What is GHCup?

GHCup is the installer and toolchain manager for the Haskell language. Similar to how `nvm` manages Node.js versions, GHCup helps you install and switch between different GHC (Glasgow Haskell Compiler) versions.

### Installation Process

```bash
# Install GHCup - the toolchain manager for Haskell
curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh
```

This command:
1. Downloads the GHCup installer script securely (HTTPS only)
2. Runs it in your shell
3. Walks you through the installation process

During installation, GHCup will:
- Set up its environment in `~/.ghcup/`
- Offer to modify your shell configuration (`.bashrc`, `.zshrc`, etc.)
- Install base components like GHC, cabal-install, HLS, and Stack (if selected)

### Setting Up GHC 9.8.2

After installing GHCup, you need to install and activate GHC 9.8.2 specifically:

```bash
# Ensure GHCup is in your PATH
source ~/.ghcup/env  # If not already added to your shell

# Install GHC 9.8.2
ghcup install ghc 9.8.2

# Set it as the active GHC version
ghcup set ghc 9.8.2

# Verify the installation
ghc --version  # Should output: The Glorious Glasgow Haskell Compilation System, version 9.8.2
```

### Installing Cabal

Cabal is the build system and package manager for Haskell:

```bash
# Install Cabal if not already installed
ghcup install cabal

# Update the package database
cabal update

# Verify Cabal installation
cabal --version
```

### Why These Exact Versions?

- **GHC 9.8.2**: The latest stable release with modern language features
- **Cabal**: Required to build and manage Haskell packages

## Step 2: Create the Haskell Core Component

### Project Initialization

First, we create a directory structure and initialize a Cabal project:

```bash
# Create the core directory
mkdir -p ./core
cd ./core

# Initialize a Cabal project
cabal init --minimal --lib=core --exe=core --main-is=Main.hs
```

This creates:
- A minimal project template
- Both a library and executable component
- Main.hs as the entry point

### Understanding the Main.cabal File

The `Main.cabal` file (or `core.cabal` depending on your project name) defines your project metadata and dependencies:

```cabal
cabal-version:      3.0
name:               core
version:            0.1.0.0
license:            MIT
build-type:         Simple

executable core
  main-is:          Main.hs
  build-depends:    base ^>=4.19.0.0,
                    aeson ^>=2.2.1.0,
                    bytestring ^>=0.11.5.0
  hs-source-dirs:   app
  default-language: GHC2021
  ghc-options:      -Wall
```

Key components explained:
- **cabal-version**: The version of the Cabal specification (3.0 is current)
- **name/version**: Project identification
- **executable core**: Defines an executable component
- **build-depends**: External dependencies
  - **base**: The standard library
  - **aeson**: JSON parsing/generation
  - **bytestring**: Efficient byte string handling
- **default-language**: Language standard to use
- **ghc-options**: Compiler flags
  - **-Wall**: Enable all warnings

### Creating a Basic Main.hs

For now, we'll implement a simple stdin/stdout version that reads a line of JSON and responds with `{"pong": 1}`:

```haskell
module Main where

import System.IO (hSetBuffering, stdin, stdout, BufferMode(LineBuffering))
import Data.Aeson (decode, encode, Value(..), Object, object, (.=))
import qualified Data.ByteString.Lazy.Char8 as BL

main :: IO ()
main = do
  -- Set buffering mode to line buffering for stdin and stdout
  hSetBuffering stdin LineBuffering
  hSetBuffering stdout LineBuffering
  
  -- Read a line from stdin
  line <- BL.getLine
  
  -- Parse JSON input (for now, just respond regardless of content)
  -- In a real application, we would inspect the parsed JSON here
  -- let maybeJson = decode line :: Maybe Value
  
  -- Write response to stdout
  BL.putStrLn $ encode $ object ["pong" .= (1 :: Int)]
```

This does the following:
1. Sets both stdin and stdout to line buffering mode
2. Reads a line from standard input
3. Responds with `{"pong": 1}` JSON object

### Testing the Basic Implementation

Test the implementation with:

```bash
cd core
cabal build
echo '{"ping":1}' | cabal run
```

You should see `{"pong":1}` printed to the console.

### Understanding Haskell Types for JSON

The code uses:
- `decode` - Parses a JSON string into a Haskell value
- `encode` - Generates a JSON string from a Haskell value
- `object` - Creates a JSON object from a list of key-value pairs
- `(.=)` - Creates a key-value pair for JSON objects

## Step 3: Implement the Nix Development Environment

### What is Nix?

Nix is a powerful package manager that enables reproducible, declarative development environments. Unlike traditional package managers, Nix isolates packages to prevent dependency conflicts.

### Creating the flake.nix File

Create `flake.nix` at the repository root:

```nix
{
  description = "OpenClaw development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            # Haskell
            pkgs.haskell.compiler.ghc982
            pkgs.haskellPackages.cabal-install
            
            # Node.js
            pkgs.nodejs_22
            pkgs.nodePackages.typescript
            pkgs.nodePackages.ts-node
          ];
        };
      }
    );
}
```

Key components explained:
- **description**: A human-readable description
- **inputs**: External dependencies
  - **nixpkgs**: The main Nix packages repository
  - **flake-utils**: Utilities for writing flakes
- **outputs**: What this flake provides
  - **devShells.default**: A development shell environment
  - **buildInputs**: Packages available inside the shell
    - GHC 9.8.2
    - Cabal package manager
    - Node.js 22
    - TypeScript and ts-node

### Using the Nix Environment

After creating the `flake.nix` file:

```bash
# Generate the lock file (first time)
nix flake lock

# Enter the development shell
nix develop

# Verify the environment
ghc --version  # Should show 9.8.2
node --version  # Should show v22.x.x
```

In the `nix develop` shell, both GHC and Node.js will be available at the correct versions, regardless of what's installed on the host system.

### Why Nix?

Nix provides several critical benefits:
1. **Reproducibility**: Everyone gets the exact same environment
2. **Isolation**: Dependencies don't interfere with your system
3. **Cross-platform**: Works on Linux, macOS, and Windows (via WSL)

## Step 4: Upgrade to Unix Domain Socket Communication

### What are Unix Domain Sockets?

Unix Domain Sockets (UDS) are an IPC mechanism for local processes on the same machine. Unlike TCP/IP sockets, UDS don't have networking overhead, making them faster for local communication.

UDS appear as files in the filesystem (e.g., `/tmp/openclaw-core.sock`).

### Updating the Cabal File

First, we need to add network dependencies:

```cabal
executable core
  main-is:          Main.hs
  build-depends:    base ^>=4.19.0.0,
                    network ^>=3.1.4.0,
                    aeson ^>=2.2.1.0,
                    bytestring >=0.11.5.0 && <0.13,
                    text ^>=2.1,
                    scientific ^>=0.3.7.0,
                    directory ^>=1.3.7.0
  hs-source-dirs:   app
  default-language: GHC2021
  ghc-options:      -Wall -threaded
```

Key additions:
- **network**: For socket programming
- **directory**: For file operations (to clean up socket files)
- **-threaded**: Enables GHC's threaded runtime for concurrency

> **Lesson — Cabal version bounds and GHC boot libraries:** The `^>=` operator in Cabal means "compatible release" — `^>=0.11.5.0` only allows `0.11.x`. This caused a CI failure: GHC 9.8.2 ships with `bytestring 0.12` as a boot library (bundled with the compiler), and `unix` depends on it. Cabal couldn't satisfy both constraints simultaneously.
>
> The fix is to use an explicit range: `>=0.11.5.0 && <0.13`. This accepts both `0.11` and `0.12`, unblocking the solver.
>
> **Rule of thumb:** Use `^>=` for most dependencies. For packages that GHC ships as boot libraries (`bytestring`, `text`, `base`, `containers`, `unix`), prefer an explicit range so you don't get locked out of newer compiler versions.

### Implementing the UDS Server

Replace the contents of `Main.hs` with:

```haskell
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
```

This implementation:
1. Creates a Unix socket at `/tmp/openclaw-core.sock`
2. Accepts a single client connection
3. Processes JSON messages from the client
4. Responds with `{"pong": 1}` when it receives `{"ping": 1}`
5. Cleans up the socket file on shutdown

### Understanding the Socket API

Key functions:
- **socket**: Creates a new socket
- **bind**: Associates the socket with an address
- **listen**: Marks the socket as passive (server)
- **accept**: Accepts a connection from a client
- **recv/sendAll**: Receive/send data over the socket

### Resource Management with Bracket

The code uses Haskell's `bracket` pattern for proper resource management:
1. **Acquire**: Create the socket
2. **Use**: Set up server and handle clients
3. **Release**: Close the socket (even if an error occurs)

This ensures resources are properly cleaned up, similar to try-with-resources in Java or context managers in Python.

## Step 5: Create the TypeScript Core Supervisor

### Setting Up TypeScript

First, configure TypeScript for the Node.js application:

```bash
# Initialize package.json if not already done
npm init -y

# Install TypeScript and Node.js type definitions
npm install --save-dev typescript ts-node @types/node
```

Create a TypeScript configuration file (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]  // Explicitly include Node.js types
  },
  "include": ["src/**/*"]
}
```

> **Important:** The `"types": ["node"]` line is crucial - it tells TypeScript to include the Node.js type definitions. Without this, you might see errors like "Cannot find name 'child_process'".

If you encounter TypeScript errors about Node.js types even with the above configuration, you can try:

1. Reinstalling the Node.js type definitions:
   ```bash
   npm uninstall @types/node
   npm install --save-dev @types/node
   ```

2. Using the newer `node:` prefix import style for built-in Node.js modules:
   ```typescript
   import * as childProcess from 'node:child_process';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   ```

### Implementing the Core Supervisor

Create `src/core-supervisor.ts`:

```typescript
// Use the node: prefix for built-in modules to avoid TypeScript issues
import * as childProcess from 'node:child_process';
const { spawn } = childProcess;
type ChildProcess = childProcess.ChildProcess;

import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOCKET_PATH = '/tmp/openclaw-core.sock';

export class CoreSupervisor {
  private coreProcess: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private connected = false;

  async start(): Promise<void> {
    // Use pre-built binary if available (CI), otherwise fall back to cabal run (local dev)
    const coreBinary = process.env.CORE_BINARY;
    if (coreBinary) {
      this.coreProcess = spawn(coreBinary, []);
    } else {
      this.coreProcess = spawn('cabal', ['run'], {
        cwd: path.join(process.cwd(), 'core')
      });
    }

    this.coreProcess.stdout.on('data', (data) => {
      console.log(`Core stdout: ${data}`);
    });

    this.coreProcess.stderr.on('data', (data) => {
      console.log(`Core stderr: ${data}`);
    });

    this.coreProcess.on('error', (err) => {
      console.error('Failed to start core process:', err);
      throw err;
    });

    this.coreProcess.on('close', (code) => {
      console.log(`Core process exited with code ${code}`);
      this.connected = false;
      this.coreProcess = null;
    });

    // Wait for socket file to be created
    await this.waitForSocket();

    // Connect to UDS
    this.socket = new net.Socket();
    
    return new Promise((resolve, reject) => {
      this.socket!.connect(SOCKET_PATH, () => {
        this.connected = true;
        console.log('Connected to core UDS');
        resolve();
      });
      
      this.socket!.on('error', (err) => {
        console.error('Socket error:', err);
        reject(err);
      });
    });
  }

  async ping(): Promise<number> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to core');
    }

    return new Promise((resolve, reject) => {
      const start = performance.now();
      
      const dataHandler = (data: Buffer) => {
        const responseStr = data.toString().trim();
        try {
          const response = JSON.parse(responseStr);
          if (response.pong === 1) {
            const latency = performance.now() - start;
            this.socket!.removeListener('data', dataHandler);
            resolve(latency);
          }
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${responseStr}`));
        }
      };

      this.socket!.on('data', dataHandler);
      this.socket!.write(JSON.stringify({ ping: 1 }) + '\n');
      
      // Set timeout for response
      setTimeout(() => {
        this.socket!.removeListener('data', dataHandler);
        reject(new Error('Ping timeout: No response within 2ms'));
      }, 2);
    });
  }

  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    if (this.coreProcess) {
      this.coreProcess.kill();
      this.coreProcess = null;
    }
    
    this.connected = false;
  }

  private async waitForSocket(timeout = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (fs.existsSync(SOCKET_PATH)) {
          return;
        }
      } catch (err) {
        // Ignore error and continue waiting
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for socket ${SOCKET_PATH}`);
  }
}

// Example usage
async function main() {
  const supervisor = new CoreSupervisor();
  
  try {
    await supervisor.start();
    
    const latency = await supervisor.ping();
    console.log(`Ping roundtrip latency: ${latency.toFixed(3)} ms`);
    
    await supervisor.stop();
  } catch (err) {
    console.error('Error:', err);
    await supervisor.stop();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
```

### Understanding the Core Supervisor

This class:
1. **Spawns the Haskell binary** as a child process
2. **Waits for the socket** to be created
3. **Connects to the socket** and establishes communication
4. **Sends ping messages** and measures the response time
5. **Cleans up resources** when done

> **Lesson — CI vs local dev binary strategy:** The original supervisor always called `cabal run`, which compiles and then runs the binary. In CI this caused two problems: the `test-ipc` job had no Cabal package list (`cabal update` hadn't been run), and there was a dependency conflict.
>
> The fix is the `CORE_BINARY` environment variable pattern:
> - In CI, `build-haskell` compiles the binary once and uploads it as an artifact. `test-ipc` downloads it and sets `CORE_BINARY=/path/to/core`. The supervisor skips `cabal run` entirely and just executes the pre-built binary — fast and dependency-free.
> - Locally, `CORE_BINARY` is unset, so the supervisor falls back to `cabal run` as before.
>
> This is a general pattern for any project that crosses a build/test job boundary in CI: **build once, pass the artifact, run it directly.**

Key concepts:
- **Child process management**: Starting, monitoring, and stopping the Haskell binary
- **Socket programming**: Connecting to and communicating over the UDS
- **Performance measurement**: Measuring round-trip latency with high precision

### Node.js Promises and Async/Await

The code uses modern JavaScript patterns:
- **async/await**: Makes asynchronous code read like synchronous code
- **Promises**: Represents a future value that may be available
- **Event handling**: Socket and process events (`on('data')`, `on('close')`, etc.)

### TypeScript Null Safety

When working with potentially null or undefined values in TypeScript, use these techniques:

1. **Guard clauses**:
   ```typescript
   if (!this.socket) {
     throw new Error('Not connected');
   }
   // Now TypeScript knows this.socket is not null
   ```

2. **Local references**:
   ```typescript
   // Store reference to avoid null assertions
   const socket = this.socket;
   socket.on('data', handler);
   ```

3. **Optional chaining**:
   ```typescript
   process.stdout?.on('data', handler);
   ```

4. **Non-null assertion (use sparingly)**:
   ```typescript
   this.socket!.connect(); // Only when you're certain it's not null
   ```

5. **Avoid reserved variable names**:
   ```typescript
   // DON'T use Node.js global names like 'process'
   const process = this.coreProcess; // BAD - conflicts with global process
   
   // DO use descriptive, non-conflicting names
   const proc = this.coreProcess; // GOOD
   ```

## Step 6: Implement the Benchmark Tests

### Setting Up Vitest

Vitest is a modern test runner for JavaScript:

```bash
npm install --save-dev vitest
```

Update `package.json` to add the test script:

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

### Creating the Benchmark Test

Create `test/ipc-benchmark.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoreSupervisor } from '../src/core-supervisor';

describe('IPC performance', () => {
  let supervisor: CoreSupervisor;
  
  beforeAll(async () => {
    supervisor = new CoreSupervisor();
    await supervisor.start();
  }, 10000); // Allow 10s for startup
  
  afterAll(async () => {
    await supervisor.stop();
  });
  
  it('should achieve p99 latency under 2ms for 1000 roundtrips', async () => {
    const iterations = 1000;
    const latencies: number[] = [];
    
    // Run 1000 roundtrip cycles
    for (let i = 0; i < iterations; i++) {
      const latency = await supervisor.ping();
      latencies.push(latency);
    }
    
    // Calculate statistics
    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const median = latencies[Math.floor(iterations / 2)];
    const p99Index = Math.floor(iterations * 0.99);
    const p99Latency = latencies[p99Index];
    
    console.log(`
    Roundtrip latency statistics (ms):
    Min:    ${min.toFixed(5)}
    Median: ${median.toFixed(5)}
    p99:    ${p99Latency.toFixed(5)}
    Max:    ${max.toFixed(5)}
    `);
    
    // Assert that p99 latency is under 2ms
    expect(p99Latency).toBeLessThan(2);
  }, 30000); // Allow 30s for the test
});
```

### Understanding the Benchmark Design

This test:
1. **Sets up once**: Creates a supervisor and starts the core
2. **Runs 1000 pings**: Measures each roundtrip
3. **Calculates statistics**: Min, median, p99, max
4. **Verifies performance**: Asserts p99 latency is under 2ms

The p99 metric (99th percentile) represents the worst-case performance for 99% of requests, making it a good measure of real-world reliability.

### Test Lifecycle Hooks

Vitest provides lifecycle hooks similar to other test frameworks:
- **beforeAll**: Runs once before all tests in the suite
- **afterAll**: Runs once after all tests in the suite
- **beforeEach/afterEach**: Run before/after each test

## Step 7: Set Up GitHub Actions CI Workflow

### What is GitHub Actions?

GitHub Actions is a CI/CD platform integrated with GitHub. It automates building, testing, and deploying code when changes are pushed to your repository.

### Creating the Workflow File

> **Implementation note:** The CI was initially written using `haskell-actions/setup` to install GHC directly, bypassing Nix entirely. This contradicted the plan — Step 3 establishes Nix as the environment source of truth, so CI must use it too. The corrected approach uses `install-nix-action` + `nix develop --command` for all jobs, which also unblocks Cachix in Step 8 (Cachix requires Nix to be present).

Create a file at `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-haskell:
    name: Build Haskell Core
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Nix
        uses: cachix/install-nix-action@v27
        with:
          nix_path: nixpkgs=channel:nixos-unstable
          extra_nix_config: |
            experimental-features = nix-command flakes

      - name: Set up Cachix
        uses: cachix/cachix-action@v15
        with:
          name: haskell-claw
          authToken: '${{ secrets.CACHIX_AUTH_TOKEN }}'

      - name: Build Haskell core
        run: nix develop --command bash -c "cd core && cabal update && cabal build"

      # Copy binary to a flat, known path before uploading.
      # If you upload the raw dist-newstyle glob, actions/upload-artifact
      # preserves the full directory structure, so the download lands at
      # core-bin/dist-newstyle/.../core instead of core-bin/core.
      - name: Stage binary for upload
        run: |
          mkdir -p /tmp/core-out
          cp $(find core/dist-newstyle -type f -name "core" -executable | head -1) /tmp/core-out/core

      - name: Upload core binary
        uses: actions/upload-artifact@v4
        with:
          name: core-binary
          path: /tmp/core-out/core
          if-no-files-found: error

  build-ts:
    name: Build TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Nix
        uses: cachix/install-nix-action@v27
        with:
          nix_path: nixpkgs=channel:nixos-unstable
          extra_nix_config: |
            experimental-features = nix-command flakes

      - name: Set up Cachix
        uses: cachix/cachix-action@v15
        with:
          name: haskell-claw
          authToken: '${{ secrets.CACHIX_AUTH_TOKEN }}'

      - name: Install Node dependencies
        run: nix develop --command npm ci

      - name: Type check
        run: nix develop --command npx tsc --noEmit

  test-ipc:
    name: Test IPC Performance
    runs-on: ubuntu-latest
    needs: [build-haskell, build-ts]
    steps:
      - uses: actions/checkout@v4

      - name: Install Nix
        uses: cachix/install-nix-action@v27
        with:
          nix_path: nixpkgs=channel:nixos-unstable
          extra_nix_config: |
            experimental-features = nix-command flakes

      - name: Set up Cachix
        uses: cachix/cachix-action@v15
        with:
          name: haskell-claw
          authToken: '${{ secrets.CACHIX_AUTH_TOKEN }}'

      - name: Download core binary
        uses: actions/download-artifact@v4
        with:
          name: core-binary
          path: core-bin

      - name: Make binary executable
        run: chmod +x core-bin/core

      - name: Install Node dependencies
        run: nix develop --command npm ci

      - name: Run IPC performance test
        run: nix develop --command npm test
        env:
          CORE_BINARY: ${{ github.workspace }}/core-bin/core
```

### Understanding the Workflow

This workflow contains three jobs:
1. **build-haskell**: Builds the Haskell core binary
   - Sets up GHC and Cabal
   - Caches dependencies for speed
   - Uploads the compiled binary as an artifact
2. **build-ts**: Compiles the TypeScript code
   - Sets up Node.js
   - Installs dependencies
   - Type-checks the code
3. **test-ipc**: Runs the IPC performance test
   - Depends on both previous jobs
   - Sets up both Node.js and Haskell
   - Runs the benchmark test

### GitHub Actions Concepts

Key concepts:
- **Workflows**: A configurable automated process
- **Jobs**: A set of steps that run on a runner
- **Steps**: Individual tasks that run commands
- **Actions**: Reusable units of code
- **Artifacts**: Files produced by a job

> **Lesson — Artifact path structure:** `actions/upload-artifact` preserves directory structure relative to the repo root. If you upload a glob like `core/dist-newstyle/.../core`, the downloaded artifact will contain that full path, not just the binary. When another job downloads it to `core-bin/`, the file ends up at `core-bin/dist-newstyle/.../core` — not `core-bin/core` as you'd expect.
>
> The fix: before uploading, copy the binary to a clean staging directory (`/tmp/core-out/core`) and upload that flat path instead. Use `find` to locate the binary without hardcoding the exact Cabal output path, which varies by OS and GHC version:
> ```bash
> cp $(find core/dist-newstyle -type f -name "core" -executable | head -1) /tmp/core-out/core
> ```

## Step 8: Configure Cachix for Faster CI Builds

### What is Cachix?

Cachix is a binary cache for Nix. It stores pre-built packages so they don't need to be rebuilt from source each time, dramatically speeding up CI builds.

### Setting Up Cachix

1. **Sign up for Cachix** at https://app.cachix.org/

2. **Create a cache** (e.g., "openclaw")

3. **Generate an auth token** in your account settings

4. **Add the token as a GitHub secret**:
   - Repository Settings → Secrets and variables → Actions
   - New repository secret
   - Name: `CACHIX_AUTH_TOKEN`
   - Value: (your Cachix auth token)

### Update CI Workflow for Cachix

Cachix is already wired into the CI workflow from Step 7 — the `cachix/cachix-action` step handles both pushing and pulling automatically. When a job runs, Cachix:
1. **Pulls** any paths already in the cache before the build
2. **Pushes** any newly built Nix store paths after the build

> **Why Cachix requires Nix:** An earlier attempt tried to use Cachix with `haskell-actions/setup` (which installs GHC directly, not via Nix). This failed with `nix-env: command not found`. Cachix is a Nix binary cache — it only works when builds go through the Nix store. The fix was to install Nix first (`install-nix-action`) and run all commands inside `nix develop`. There is no separate "add Cachix to CI" step; it's already part of the correct workflow above.

### Measuring Cachix Improvement

To measure the performance improvement:
1. Push to GitHub without Cachix, record the build time
2. Push the same code with Cachix enabled, record the time again
3. Compare the difference

Example log entry:
```
Build time without Cachix: 5m 23s
Build time with Cachix: 1m 17s
Improvement: 4m 6s (76% faster)
```

### How Cachix Works

Cachix implements a push/pull model:
1. **Push**: Upload build artifacts to the Cachix service
2. **Pull**: Download pre-built packages instead of building them

This is particularly beneficial for Haskell, which has long compile times.

## Learning Resources

### Haskell
- [Learn You a Haskell for Great Good](http://learnyouahaskell.com/) - Beginner-friendly tutorial
- [Real World Haskell](http://book.realworldhaskell.org/) - Practical applications
- [Haskell & Cabal Cheatsheet](https://cabal.readthedocs.io/en/latest/cabal-commands.html) - Quick reference for commands
- [Network.Socket Documentation](http://hackage.haskell.org/package/network/docs/Network-Socket.html) - API for socket programming
- [Aeson Documentation](http://hackage.haskell.org/package/aeson/docs/Data-Aeson.html) - JSON handling in Haskell

### Node.js and TypeScript
- [Node.js Documentation](https://nodejs.org/en/docs/) - Official docs
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) - Comprehensive guide
- [Node.js Design Patterns](https://www.nodejsdesignpatterns.com/) - Book on advanced Node.js
- [Vitest Documentation](https://vitest.dev/) - Testing framework docs

### Nix
- [Nix Pills](https://nixos.org/guides/nix-pills/) - Step-by-step Nix tutorial
- [Flakes Tutorial](https://nix-tutorial.gitlabpages.inria.fr/nix-tutorial/flakes.html) - Nix flakes explained
- [Nix Package Search](https://search.nixos.org/packages) - Find packages to include

### GitHub Actions and CI
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [Cachix Documentation](https://docs.cachix.org/)

### IPC and Performance
- [Unix Domain Sockets](https://en.wikipedia.org/wiki/Unix_domain_socket) - Wikipedia overview
- [Improve Node.js Application Performance](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/) - Official guide
- [Low Latency Tuning Guide](https://rigtorp.se/low-latency-guide/) - General principles

## Glossary of Terms

- **GHCup**: The Haskell toolchain installer and version manager
- **GHC**: Glasgow Haskell Compiler, the main Haskell compiler
- **Cabal**: The Haskell build system and package manager
- **IPC**: Inter-Process Communication, how separate processes exchange data
- **UDS**: Unix Domain Socket, a type of IPC using filesystem paths
- **JSONL**: JSON Lines format, each line is a valid JSON object
- **Nix**: A purely functional package manager
- **Flake**: A self-contained Nix configuration
- **p99 latency**: The 99th percentile latency, a measure of worst-case performance
- **CI/CD**: Continuous Integration/Continuous Deployment
- **Cachix**: A binary cache service for Nix builds