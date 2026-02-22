import * as childProcess from 'node:child_process';
const { spawn } = childProcess;
type ChildProcess = childProcess.ChildProcess;

import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

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

    // Store a reference to avoid null checks
    const proc = this.coreProcess;

    proc.stdout?.on('data', (data) => {
      console.log(`Core stdout: ${data}`);
    });

    proc.stderr?.on('data', (data) => {
      console.log(`Core stderr: ${data}`);
    });

    proc.on('error', (err) => {
      console.error('Failed to start core process:', err);
      throw err;
    });

    proc.on('close', (code) => {
      console.log(`Core process exited with code ${code}`);
      this.connected = false;
      this.coreProcess = null;
    });

    // Wait for socket file to be created
    await this.waitForSocket();

    // Connect to UDS
    this.socket = new net.Socket();
    
    // Store reference to avoid null assertions
    const socket = this.socket;
    
    return new Promise((resolve, reject) => {
      socket.connect(SOCKET_PATH, () => {
        this.connected = true;
        console.log('Connected to core UDS');
        resolve();
      });
      
      socket.on('error', (err) => {
        console.error('Socket error:', err);
        reject(err);
      });
    });
  }

  async ping(): Promise<number> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to core');
    }

    // Store reference to avoid null assertions
    const socket = this.socket;
    
    return new Promise((resolve, reject) => {
      const start = performance.now();
      
      const dataHandler = (data: Buffer) => {
        const responseStr = data.toString().trim();
        try {
          const response = JSON.parse(responseStr);
          if (response.pong === 1) {
            const latency = performance.now() - start;
            socket.removeListener('data', dataHandler);
            resolve(latency);
          }
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${responseStr}`));
        }
      };

      socket.on('data', dataHandler);
      socket.write(JSON.stringify({ ping: 1 }) + '\n');
      
      // Set timeout for response
      setTimeout(() => {
        socket.removeListener('data', dataHandler);
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