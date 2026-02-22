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