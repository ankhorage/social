import { describe, expect, it, mock } from 'bun:test';

import {
  executeSocialActionAsync,
  type SocialActionCommand,
  type SocialAuthorizationPort,
  type SocialProviderPort,
} from './index.js';

const target = {
  provider: 'linkedin',
  accountId: 'account-1',
  accountType: 'organization',
  destinationId: 'page-1',
  destinationType: 'page',
} as const;

const command: SocialActionCommand = {
  operationKey: 'workflow-1:node-1',
  tenantId: 'tenant-1',
  actorId: 'actor-1',
  target,
  action: {
    kind: 'publish',
    text: 'Hello world',
    media: [{ mediaId: 'media-1', kind: 'image', contentType: 'image/jpeg', byteLength: 1024 }],
  },
};

describe('social action execution', () => {
  registerSuccessfulExecutionTests();
  registerPreflightRejectionTests();
  registerAuthorizationBindingTests();
  registerIdempotencyTests();
  registerProviderFailureTests();
});

/*** Register unit tests for an authorized action with preflighted media. */
function registerSuccessfulExecutionTests(): void {
  it('executes only after current capability, media preflight, and a bound authorization grant', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider();
    const media = command.action.kind === 'publish' ? command.action.media : undefined;

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: true,
      status: 'executed',
      receipt: createReceipt(),
    });
    expect(mediaPreflight.preflightAsync).toHaveBeenCalledWith(command, media);
    expect(provider.reconcileAsync).toHaveBeenCalledWith(command, 'vault:authorization-1');
    expect(provider.executeAsync).toHaveBeenCalledWith(command, 'vault:authorization-1');
  });
}

function registerPreflightRejectionTests(): void {
  it('rejects unsupported content before media preflight, authorization, or execution', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider({ contentTypes: ['text'] });

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'unsupported',
    });
    expect(mediaPreflight.preflightAsync).not.toHaveBeenCalled();
    expect(authorization.authorizeAsync).not.toHaveBeenCalled();
    expect(provider.executeAsync).not.toHaveBeenCalled();
  });

  registerInvalidMediaRejectionTest();
  registerChangedCapabilityRejectionTest();
}

function registerInvalidMediaRejectionTest(): void {
  it('rejects invalid media references at the outer preflight boundary without executing', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = {
      preflightAsync: mock(() =>
        Promise.resolve({ accepted: false, diagnostic: { code: 'media-missing' } }),
      ),
    };
    const provider = createProvider();

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'media-invalid',
      diagnostic: { code: 'media-missing' },
    });
    expect(authorization.authorizeAsync).not.toHaveBeenCalled();
    expect(provider.executeAsync).not.toHaveBeenCalled();
  });
}

function registerChangedCapabilityRejectionTest(): void {
  it('rejects a changed provider capability before reconciliation or execution', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider();
    provider.getCapabilityAsync.mockResolvedValueOnce(createCapability());
    provider.getCapabilityAsync.mockResolvedValueOnce({ ...createCapability(), enabled: false });

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'unsupported',
    });
    expect(provider.reconcileAsync).not.toHaveBeenCalled();
    expect(provider.executeAsync).not.toHaveBeenCalled();
  });
}

function registerAuthorizationBindingTests(): void {
  it('fails closed for absent required scopes', async () => {
    const authorization = createAuthorization({ scopes: [] });
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider();

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'denied',
    });
    expect(provider.executeAsync).not.toHaveBeenCalled();
  });

  it('fails closed when a grant binds another tenant, actor, account, or destination', async () => {
    const bindings = [
      { tenantId: 'tenant-2' },
      { actorId: 'actor-2' },
      { target: { ...target, accountId: 'account-2' } },
      { target: { ...target, destinationId: 'page-2' } },
    ] as const;

    for (const mismatch of bindings) {
      const authorization = createAuthorization(mismatch);
      const mediaPreflight = createAcceptedMediaPreflight();
      const provider = createProvider();

      expect(
        await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
      ).toEqual({
        dispatched: false,
        reason: 'denied',
      });
      expect(provider.executeAsync).not.toHaveBeenCalled();
    }
  });
}

function registerIdempotencyTests(): void {
  it('returns the stable reconciled receipt without a second provider effect', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider({
      reconciliation: { state: 'found', receipt: createReceipt() },
    });

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: true,
      status: 'reconciled',
      receipt: createReceipt(),
    });
    expect(provider.executeAsync).not.toHaveBeenCalled();
  });

  it('does not retry an ambiguous POST reconciliation', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider({
      reconciliation: { state: 'ambiguous', diagnostic: { code: 'pending-provider-status' } },
    });

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'ambiguous',
      diagnostic: { code: 'pending-provider-status' },
    });
    expect(provider.executeAsync).not.toHaveBeenCalled();
  });
}

function registerProviderFailureTests(): void {
  it('returns a retry-after diagnostic without provider response data', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = createAcceptedMediaPreflight();
    const provider = createProvider({
      execution: {
        state: 'rate-limited',
        diagnostic: { code: 'rate-limit', retryAfterSeconds: 60 },
      },
    });

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'rate-limited',
      diagnostic: { code: 'rate-limit', retryAfterSeconds: 60 },
    });
  });

  it('rejects a receipt that does not prove the requested target', async () => {
    const authorization = createAuthorization();
    const mediaPreflight = {
      preflightAsync: mock(() => Promise.resolve({ accepted: true } as const)),
    };
    const provider = createProvider({
      execution: {
        state: 'completed',
        receipt: createReceipt({ target: { ...target, destinationId: 'page-2' } }),
      },
    });

    expect(
      await executeSocialActionAsync(command, authorization, mediaPreflight, provider),
    ).toEqual({
      dispatched: false,
      reason: 'provider-failed',
      diagnostic: { code: 'receipt-binding-invalid' },
    });
  });
}

function createAuthorization(
  overrides: Partial<{
    readonly operationKey: string;
    readonly tenantId: string;
    readonly actorId: string;
    readonly target: SocialActionCommand['target'];
    readonly scopes: readonly string[];
  }> = {},
): SocialAuthorizationPort {
  return {
    authorizeAsync: mock(() =>
      Promise.resolve({
        authorized: true as const,
        authorizationRef: 'vault:authorization-1',
        operationKey: command.operationKey,
        tenantId: command.tenantId,
        actorId: command.actorId,
        target: command.target,
        scopes: ['w_member_social'],
        ...overrides,
      }),
    ),
  };
}

function createAcceptedMediaPreflight() {
  return {
    preflightAsync: mock(() => Promise.resolve({ accepted: true } as const)),
  };
}

function createProvider(
  overrides: Partial<{
    readonly contentTypes: readonly ('text' | 'image' | 'video' | 'link' | 'carousel')[];
    readonly reconciliation: Awaited<ReturnType<SocialProviderPort['reconcileAsync']>>;
    readonly execution: Awaited<ReturnType<SocialProviderPort['executeAsync']>>;
  }> = {},
): SocialProviderPort & {
  readonly getCapabilityAsync: ReturnType<typeof mock>;
  readonly reconcileAsync: ReturnType<typeof mock>;
  readonly executeAsync: ReturnType<typeof mock>;
} {
  const capability = createCapability(
    overrides.contentTypes === undefined ? {} : { contentTypes: overrides.contentTypes },
  );
  return {
    provider: 'linkedin',
    getCapabilityAsync: mock(() => Promise.resolve(capability)),
    reconcileAsync: mock(() =>
      Promise.resolve(overrides.reconciliation ?? { state: 'absent' as const }),
    ),
    executeAsync: mock(() => Promise.resolve(overrides.execution ?? createExecution())),
  };
}

function createCapability(
  overrides: Partial<{
    readonly enabled: boolean;
    readonly contentTypes: readonly ('text' | 'image' | 'video' | 'link' | 'carousel')[];
  }> = {},
) {
  return {
    provider: 'linkedin',
    accountType: 'organization',
    destinationType: 'page',
    enabled: true,
    publishingAllowed: true,
    actions: [{ kind: 'publish' as const, requiredScopes: ['w_member_social'] }],
    contentTypes: ['text', 'image'] as const,
    media: [{ kind: 'image' as const, contentTypes: ['image/jpeg'], maxByteLength: 2048 }],
    maxTextLength: 3000,
    maxMediaItems: 4,
    ...overrides,
  };
}

function createReceipt(
  overrides: Partial<{ readonly target: SocialActionCommand['target'] }> = {},
) {
  return {
    receiptId: 'receipt-1',
    operationKey: command.operationKey,
    target: command.target,
    resourceId: 'post-1',
    ...overrides,
  };
}

function createExecution() {
  return { state: 'completed' as const, receipt: createReceipt() };
}
