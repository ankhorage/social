import { expect, it, mock } from 'bun:test';

import {
  executeSocialActionAsync,
  type SocialActionCommand,
  type SocialProviderPort,
} from '../../../index.js';

const command: SocialActionCommand = {
  provider: 'linkedin',
  idempotencyKey: 'request-1',
  action: { kind: 'publish', text: 'Hello world' },
};

it('forwards a provider-neutral command and its idempotency key', async () => {
  const executeAsync = mock(() =>
    Promise.resolve({ receiptId: 'receipt-1', resourceId: 'post-1' }),
  );
  const provider: SocialProviderPort = {
    provider: 'linkedin',
    supportedActions: ['publish', 'comment', 'react'],
    executeAsync,
  };
  expect(await executeSocialActionAsync(command, provider)).toEqual({
    dispatched: true,
    receipt: { receiptId: 'receipt-1', resourceId: 'post-1' },
  });
  expect(executeAsync).toHaveBeenCalledWith(command);
});

it('supports provider-approved comments and reactions', async () => {
  const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
  const provider: SocialProviderPort = {
    provider: 'linkedin',
    supportedActions: ['comment', 'react'],
    executeAsync,
  };
  expect(
    await executeSocialActionAsync(
      { ...command, action: { kind: 'comment', targetId: 'post-1', text: 'Nice' } },
      provider,
    ),
  ).toEqual({ dispatched: true, receipt: { receiptId: 'receipt-1' } });
  expect(
    await executeSocialActionAsync(
      { ...command, action: { kind: 'react', targetId: 'post-1', reaction: 'like' } },
      provider,
    ),
  ).toEqual({ dispatched: true, receipt: { receiptId: 'receipt-1' } });
  expect(executeAsync).toHaveBeenCalledTimes(2);
});

it('rejects provider mismatches and unsupported actions before execution', async () => {
  const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
  expect(
    await executeSocialActionAsync(command, {
      provider: 'instagram',
      supportedActions: ['publish'],
      executeAsync,
    }),
  ).toEqual({ dispatched: false, reason: 'provider-mismatch' });
  expect(
    await executeSocialActionAsync(
      { ...command, action: { kind: 'comment', targetId: 'post-1', text: 'Hello' } },
      { provider: 'linkedin', supportedActions: ['publish'], executeAsync },
    ),
  ).toEqual({ dispatched: false, reason: 'unsupported-action' });
  expect(executeAsync).not.toHaveBeenCalled();
});

it('rejects malformed publish, comment, react and idempotency requests', async () => {
  const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
  const provider: SocialProviderPort = {
    provider: 'linkedin',
    supportedActions: ['publish', 'comment', 'react'],
    executeAsync,
  };
  const requests: SocialActionCommand[] = [
    { ...command, idempotencyKey: ' ' },
    { ...command, action: { kind: 'publish', text: ' ' } },
    { ...command, action: { kind: 'comment', targetId: ' ', text: 'Hello' } },
    { ...command, action: { kind: 'comment', targetId: 'post-1', text: ' ' } },
    { ...command, action: { kind: 'react', targetId: ' ', reaction: 'like' } },
    { ...command, action: { kind: 'react', targetId: 'post-1', reaction: ' ' } },
  ];
  for (const request of requests)
    expect(await executeSocialActionAsync(request, provider)).toEqual({
      dispatched: false,
      reason: 'invalid-command',
    });
  expect(executeAsync).not.toHaveBeenCalled();
});
