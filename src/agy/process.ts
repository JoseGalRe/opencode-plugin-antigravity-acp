import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import { ndJsonStream } from '@agentclientprotocol/sdk';

import type { AgyExit, AgyProcess, AgyProcessOptions } from './process.types.ts';

/**
 * The arguments every server gets: ACP over stdio, with `agy`'s telemetry off.
 */
export const DEFAULT_AGY_ARGS = ['acp', '--disable-telemetry'] as const;

export function spawnAgy(options: AgyProcessOptions): AgyProcess {
  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const exited = new Promise<AgyExit>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => options.onStderr?.(text));

  const input = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;

  return {
    stream: ndJsonStream(output, input),
    pid: child.pid,
    exited,
    kill: () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    },
  };
}
