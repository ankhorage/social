import { describe, expect, it, mock } from 'bun:test';

import {
  areSocialAnalyticsObservationsComparable,
  executeSocialActionAsync,
  getSocialAnalyticsCapabilitiesAsync,
  retrieveSocialAnalyticsAsync,
  type SocialAnalyticsAdapter,
  type SocialAnalyticsQuery,
  type SocialActionCommand,
  type SocialProviderPort,
} from './index.js';

const query: SocialAnalyticsQuery = {
  provenance: {
    tenantId: 'tenant-a',
    provider: 'pinterest',
    accountId: 'account-1',
    targetId: 'board-1',
    contentId: 'pin-1',
  },
  providerMetricIds: ['PIN_IMPRESSION', 'PIN_SAVE', 'OUTBOUND_CLICK'],
};

const adapter: SocialAnalyticsAdapter = {
  getCapabilitiesAsync: (requestedQuery) =>
    Promise.resolve(
      requestedQuery.providerMetricIds.map((providerMetricId) => ({
        provenance: requestedQuery.provenance,
        metric: {
          providerMetricId,
          meaning:
            providerMetricId === 'PIN_SAVE'
              ? 'Saves recorded by Pinterest.'
              : 'Organic impressions recorded by Pinterest.',
          unit: 'count' as const,
        },
        availability:
          providerMetricId === 'OUTBOUND_CLICK'
            ? { kind: 'unsupported' as const }
            : { kind: 'supported' as const },
      })),
    ),
  retrieveAsync: (requestedQuery) =>
    Promise.resolve([
      {
        provenance: requestedQuery.provenance,
        metric: {
          providerMetricId: 'PIN_IMPRESSION',
          meaning: 'Organic impressions recorded by Pinterest.',
          unit: 'count' as const,
        },
        window: { startedAt: '2026-11-01T00:00:00.000Z', endedAt: '2026-11-07T23:59:59.999Z' },
        retrievedAt: '2026-11-10T00:00:00.000Z',
        availability: { kind: 'available' as const, value: 0 },
      },
      {
        provenance: requestedQuery.provenance,
        metric: {
          providerMetricId: 'PIN_SAVE',
          meaning: 'Saves recorded by Pinterest.',
          unit: 'count' as const,
        },
        window: { startedAt: '2026-11-01T00:00:00.000Z', endedAt: '2026-11-30T23:59:59.999Z' },
        retrievedAt: '2026-11-23T00:00:00.000Z',
        availability: {
          kind: 'unavailable' as const,
          reason: 'missing-permission' as const,
          missingScopes: ['pins:read'],
        },
      },
      {
        provenance: requestedQuery.provenance,
        metric: {
          providerMetricId: 'OUTBOUND_CLICK',
          meaning: 'Organic impressions recorded by Pinterest.',
          unit: 'count' as const,
        },
        window: { startedAt: '2026-11-01T00:00:00.000Z', endedAt: '2026-11-07T23:59:59.999Z' },
        retrievedAt: '2026-11-23T00:00:00.000Z',
        availability: { kind: 'unsupported' as const },
      },
    ]),
};

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

describe('social analytics retrieval', () => {
  it('keeps mixed windows, provider-native meanings, unavailable fields and freshness explicit', async () => {
    const observations = await retrieveSocialAnalyticsAsync({
      adapter,
      query,
      observedAt: '2026-11-23T12:00:00.000Z',
      maximumAgeMs: 24 * 60 * 60 * 1000,
    });

    expect(observations).toHaveLength(3);
    expect(observations[0]?.freshness).toBe('stale');
    expect(observations[1]?.freshness).toBe('fresh');
    expect(observations[1]?.availability).toEqual({
      kind: 'unavailable',
      reason: 'missing-permission',
      missingScopes: ['pins:read'],
    });
    expect(observations[2]?.availability).toEqual({ kind: 'unsupported' });
    expect('value' in (observations[1]?.availability ?? {})).toBeFalse();
    const [impressions, saves, outboundClicks] = observations;

    if (!impressions || !saves || !outboundClicks) {
      throw new Error('Expected each requested Pinterest observation.');
    }

    expect(areSocialAnalyticsObservationsComparable(impressions, saves)).toBeFalse();
    expect(areSocialAnalyticsObservationsComparable(impressions, outboundClicks)).toBeFalse();
  });

  it('retains an explicit provider capability for unsupported fields', async () => {
    const capabilities = await getSocialAnalyticsCapabilitiesAsync({ adapter, query });

    expect(capabilities[2]).toMatchObject({
      provenance: query.provenance,
      metric: { providerMetricId: 'OUTBOUND_CLICK' },
      availability: { kind: 'unsupported' },
    });
  });

  it('accepts provider-native adapter capabilities for each supported provider', async () => {
    const providers = ['facebook', 'instagram', 'linkedin', 'pinterest'] as const;

    const capabilities = await Promise.all(
      providers.map((provider) =>
        getSocialAnalyticsCapabilitiesAsync({
          adapter: {
            getCapabilitiesAsync: (requestedQuery) =>
              Promise.resolve([
                {
                  provenance: requestedQuery.provenance,
                  metric: {
                    providerMetricId: `${provider}.native-metric`,
                    meaning: `Provider-native ${provider} metric.`,
                    unit: 'provider-defined',
                  },
                  availability: { kind: 'supported' },
                },
              ]),
          },
          query: {
            provenance: { ...query.provenance, provider },
            providerMetricIds: [`${provider}.native-metric`],
          },
        }),
      ),
    );

    expect(capabilities.map(([capability]) => capability?.provenance.provider)).toEqual([
      ...providers,
    ]);
  });

  it('rejects observations outside the requested tenant provenance', async () => {
    const [retrieval] = await adapter.retrieveAsync(query);

    if (!retrieval) {
      throw new Error('Expected a source observation.');
    }

    try {
      await retrieveSocialAnalyticsAsync({
        adapter: {
          ...adapter,
          retrieveAsync: () =>
            Promise.resolve([
              {
                ...retrieval,
                provenance: { ...query.provenance, tenantId: 'tenant-b' },
              },
            ]),
        },
        query,
        observedAt: '2026-11-23T12:00:00.000Z',
        maximumAgeMs: 24 * 60 * 60 * 1000,
      });
      throw new Error('Expected tenant provenance validation to reject the observation.');
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }

      expect(error.message).toContain('outside the declared capability');
    }
  });

  it('compares observations only when they share the same authorized source', async () => {
    const [observation] = await retrieveSocialAnalyticsAsync({
      adapter,
      query,
      observedAt: '2026-11-23T12:00:00.000Z',
      maximumAgeMs: 24 * 60 * 60 * 1000,
    });

    if (!observation) {
      throw new Error('Expected a source observation.');
    }

    expect(areSocialAnalyticsObservationsComparable(observation, { ...observation })).toBeTrue();
    expect(
      areSocialAnalyticsObservationsComparable(observation, {
        ...observation,
        provenance: { ...observation.provenance, tenantId: 'tenant-b' },
      }),
    ).toBeFalse();
    expect(
      areSocialAnalyticsObservationsComparable(observation, {
        ...observation,
        provenance: { ...observation.provenance, accountId: 'account-2' },
      }),
    ).toBeFalse();
    expect(
      areSocialAnalyticsObservationsComparable(observation, {
        ...observation,
        provenance: { ...observation.provenance, targetId: 'board-2' },
      }),
    ).toBeFalse();
    expect(
      areSocialAnalyticsObservationsComparable(observation, {
        ...observation,
        provenance: { ...observation.provenance, contentId: 'pin-2' },
      }),
    ).toBeFalse();
  });

  it('rejects available values for unsupported or unavailable capabilities', async () => {
    const [retrieval] = await adapter.retrieveAsync(query);

    if (!retrieval) {
      throw new Error('Expected a source observation.');
    }

    const createAdapter = (
      availability: { kind: 'unsupported' } | { kind: 'unavailable'; reason: 'not-ready' },
    ): SocialAnalyticsAdapter => ({
      getCapabilitiesAsync: () =>
        Promise.resolve([
          {
            provenance: query.provenance,
            metric: retrieval.metric,
            availability,
          },
        ]),
      retrieveAsync: () =>
        Promise.resolve([{ ...retrieval, availability: { kind: 'available', value: 42 } }]),
    });

    const readInput = {
      query: { ...query, providerMetricIds: [retrieval.metric.providerMetricId] },
      observedAt: '2026-11-23T12:00:00.000Z',
      maximumAgeMs: 24 * 60 * 60 * 1000,
    };

    const assertAvailableValueIsRejectedAsync = async (
      availability: { kind: 'unsupported' } | { kind: 'unavailable'; reason: 'not-ready' },
    ): Promise<void> => {
      try {
        await retrieveSocialAnalyticsAsync({ ...readInput, adapter: createAdapter(availability) });
        throw new Error('Expected the available value to be rejected.');
      } catch (error: unknown) {
        if (!(error instanceof Error)) {
          throw error;
        }

        expect(error.message).toContain('outside the declared capability');
      }
    };

    await assertAvailableValueIsRejectedAsync({ kind: 'unsupported' });
    await assertAvailableValueIsRejectedAsync({ kind: 'unavailable', reason: 'not-ready' });
  });
});
