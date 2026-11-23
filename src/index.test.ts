import { describe, expect, it, mock } from 'bun:test';

import {
  executeSocialActionAsync,
  type SocialActionCommand,
  type SocialAuthorizationPort,
  type SocialProviderPort,
} from './index.js';

const command: SocialActionCommand = {
  connectionId: 'connection-1',
  provider: 'linkedin',
  idempotencyKey: 'flow-run-1:node-1',
  action: { kind: 'publish', text: 'Hello world' },
};

describe('social action execution', () => {
  registerSuccessfulDispatchTests();
  registerPreAuthorizationRejectionTests();
  registerAuthorizationRejectionTests();
});

/*** Register unit tests for provider-approved social actions. */
function registerSuccessfulDispatchTests(): void {
  it('authorizes once and forwards the idempotency key and opaque reference', async () => {
    const authorizeAsync = mock(() => Promise.resolve({ authorizationRef: 'vault:connection-1' }));
    const executeAsync = mock(() =>
      Promise.resolve({ receiptId: 'receipt-1', resourceId: 'post-1' }),
    );
    const authorization: SocialAuthorizationPort = { authorizeAsync };
    const provider: SocialProviderPort = {
      provider: 'linkedin',
      supportedActions: ['publish', 'comment', 'react'],
      executeAsync,
    };

    expect(await executeSocialActionAsync(command, authorization, provider)).toEqual({
      dispatched: true,
      receipt: { receiptId: 'receipt-1', resourceId: 'post-1' },
    });
    expect(authorizeAsync).toHaveBeenCalledWith(command);
    expect(executeAsync).toHaveBeenCalledWith(command, 'vault:connection-1');
    expect(executeAsync).toHaveBeenCalledTimes(1);
  });

  it('supports a provider-approved comment and reaction', async () => {
    const authorization: SocialAuthorizationPort = {
      authorizeAsync: () => Promise.resolve({ authorizationRef: 'vault:connection-1' }),
    };
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
    const provider: SocialProviderPort = {
      provider: 'linkedin',
      supportedActions: ['comment', 'react'],
      executeAsync,
    };

    expect(
      await executeSocialActionAsync(
        { ...command, action: { kind: 'comment', targetId: 'post-1', text: 'Nice' } },
        authorization,
        provider,
      ),
    ).toEqual({ dispatched: true, receipt: { receiptId: 'receipt-1' } });
    expect(
      await executeSocialActionAsync(
        { ...command, action: { kind: 'react', targetId: 'post-1', reaction: 'like' } },
        authorization,
        provider,
      ),
    ).toEqual({ dispatched: true, receipt: { receiptId: 'receipt-1' } });
    expect(executeAsync).toHaveBeenCalledTimes(2);
  });
}

/*** Register unit tests for dispatch decisions made before authorization. */
function registerPreAuthorizationRejectionTests(): void {
  it('rejects a provider mismatch before authorization', async () => {
    const authorizeAsync = mock(() => Promise.resolve({ authorizationRef: 'vault:connection-1' }));
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));

    expect(
      await executeSocialActionAsync(
        command,
        { authorizeAsync },
        { provider: 'instagram', supportedActions: ['publish'], executeAsync },
      ),
    ).toEqual({ dispatched: false, reason: 'provider-mismatch' });
    expect(authorizeAsync).not.toHaveBeenCalled();
    expect(executeAsync).not.toHaveBeenCalled();
  });

  it('rejects an unsupported operation before authorization', async () => {
    const authorizeAsync = mock(() => Promise.resolve({ authorizationRef: 'vault:connection-1' }));
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));

    expect(
      await executeSocialActionAsync(
        { ...command, action: { kind: 'comment', targetId: 'post-1', text: 'Hello' } },
        { authorizeAsync },
        { provider: 'linkedin', supportedActions: ['publish'], executeAsync },
      ),
    ).toEqual({ dispatched: false, reason: 'unsupported-action' });
    expect(authorizeAsync).not.toHaveBeenCalled();
    expect(executeAsync).not.toHaveBeenCalled();
  });

  registerInvalidCommandTest();
}

/*** Register a unit test for malformed action commands. */
function registerInvalidCommandTest(): void {
  it('rejects malformed publish, comment, react and idempotency requests', async () => {
    const authorizeAsync = mock(() => Promise.resolve({ authorizationRef: 'vault:connection-1' }));
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
    const authorization: SocialAuthorizationPort = { authorizeAsync };
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
      expect(await executeSocialActionAsync(request, authorization, provider)).toEqual({
        dispatched: false,
        reason: 'invalid-command',
      });
    }
    expect(authorizeAsync).not.toHaveBeenCalled();
    expect(executeAsync).not.toHaveBeenCalled();
  });
}

/*** Register unit tests for denied authorization grants. */
function registerAuthorizationRejectionTests(): void {
  it('rejects missing connection grants without reaching the provider', async () => {
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
    expect(
      await executeSocialActionAsync(
        command,
        { authorizeAsync: () => Promise.resolve(null) },
        { provider: 'linkedin', supportedActions: ['publish'], executeAsync },
      ),
    ).toEqual({ dispatched: false, reason: 'connection-denied' });
    expect(executeAsync).not.toHaveBeenCalled();
  });

  it('rejects empty authorization references without reaching the provider', async () => {
    const executeAsync = mock(() => Promise.resolve({ receiptId: 'receipt-1' }));
    expect(
      await executeSocialActionAsync(
        command,
        { authorizeAsync: () => Promise.resolve({ authorizationRef: '  ' }) },
        { provider: 'linkedin', supportedActions: ['publish'], executeAsync },
      ),
    ).toEqual({ dispatched: false, reason: 'connection-denied' });
    expect(executeAsync).not.toHaveBeenCalled();
  });
}
