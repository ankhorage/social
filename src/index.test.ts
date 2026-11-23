import { describe, expect, it, mock } from 'bun:test';

import {
  executeSocialActionAsync,
  type SocialActionCommand,
  type SocialProviderPort,
} from './index.js';

const command: SocialActionCommand = {
  provider: 'linkedin',
  idempotencyKey: 'request-1',
  action: { kind: 'publish', text: 'Hello world' },
};

describe('social action execution', () => {
  registerSuccessfulDispatchTests();
  registerRejectionTests();
});

/*** Register unit tests for provider-approved social actions. */
function registerSuccessfulDispatchTests(): void {
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
    expect(executeAsync).toHaveBeenCalledTimes(1);
  });

  it('supports a provider-approved comment and reaction', async () => {
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
}

/*** Register unit tests for dispatch rejections made before provider execution. */
function registerRejectionTests(): void {
  it('rejects a provider mismatch before provider execution', async () => {
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));

    expect(
      await executeSocialActionAsync(command, {
        provider: 'instagram',
        supportedActions: ['publish'],
        executeAsync,
      }),
    ).toEqual({ dispatched: false, reason: 'provider-mismatch' });
    expect(executeAsync).not.toHaveBeenCalled();
  });

  it('rejects an unsupported operation before provider execution', async () => {
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));

    expect(
      await executeSocialActionAsync(
        { ...command, action: { kind: 'comment', targetId: 'post-1', text: 'Hello' } },
        { provider: 'linkedin', supportedActions: ['publish'], executeAsync },
      ),
    ).toEqual({ dispatched: false, reason: 'unsupported-action' });
    expect(executeAsync).not.toHaveBeenCalled();
  });

  registerInvalidCommandTest();
}

/*** Register a unit test for malformed action commands. */
function registerInvalidCommandTest(): void {
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

    for (const request of requests) {
      expect(await executeSocialActionAsync(request, provider)).toEqual({
        dispatched: false,
        reason: 'invalid-command',
      });
    }
    expect(executeAsync).not.toHaveBeenCalled();
  });
}
