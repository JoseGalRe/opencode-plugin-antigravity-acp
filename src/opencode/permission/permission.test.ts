import { describe, expect, it } from 'vite-plus/test';

import { answerPermission, permissionCheckFor } from './permission.ts';

import type { PermissionOption } from '@agentclientprotocol/sdk';

const OPTIONS: PermissionOption[] = [
  { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
  { optionId: 'once', name: 'Allow', kind: 'allow_once' },
  { optionId: 'no', name: 'Deny', kind: 'reject_once' },
];

describe('permissionCheckFor', () => {
  it('checks commands against OpenCode’s shell rules, by command line', () => {
    expect(
      permissionCheckFor({
        sessionId: 's1',
        toolCall: { toolCallId: 't1', title: 'Run tests', kind: 'execute', rawInput: { command: 'npm test' } },
        options: OPTIONS,
      }),
    ).toEqual({ action: 'shell', resources: ['npm test'], metadata: { title: 'Run tests', kind: 'execute' } });
  });

  it('checks edits against OpenCode’s edit rules, by path', () => {
    expect(
      permissionCheckFor({
        sessionId: 's1',
        toolCall: { toolCallId: 't1', title: 'Delete a.txt', kind: 'delete', locations: [{ path: '/repo/a.txt' }] },
        options: OPTIONS,
      }),
    ).toMatchObject({ action: 'edit', resources: ['/repo/a.txt'] });
  });

  it('uses the antigravity action and the title for tools OpenCode has no action for', () => {
    expect(
      permissionCheckFor({ sessionId: 's1', toolCall: { toolCallId: 't1', title: 'Switch to plan mode' }, options: OPTIONS }),
    ).toMatchObject({ action: 'antigravity', resources: ['Switch to plan mode'], metadata: { kind: 'other' } });
  });
});

describe('answerPermission', () => {
  it('answers with a one-time option, so OpenCode keeps the "always" decisions', () => {
    expect(answerPermission(OPTIONS, true)).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } });
    expect(answerPermission(OPTIONS, false)).toEqual({ outcome: { outcome: 'selected', optionId: 'no' } });
  });

  it('cancels when agy offered no option of that kind', () => {
    expect(answerPermission([{ optionId: 'once', name: 'Allow', kind: 'allow_once' }], false)).toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });
});
