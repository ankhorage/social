import { expect, it } from 'bun:test';

import {
  areSocialAnalyticsObservationsComparable,
  getSocialAnalyticsCapabilitiesAsync,
  retrieveSocialAnalyticsAsync,
  type SocialAnalyticsAdapter,
  type SocialAnalyticsQuery,
} from '../../../index.js';

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
const input = {
  adapter,
  query,
  observedAt: '2026-11-23T12:00:00.000Z',
  maximumAgeMs: 24 * 60 * 60 * 1000,
};

it('preserves provider-native windows, availability and freshness', async () => {
  const observations = await retrieveSocialAnalyticsAsync(input);
  expect(observations.map((observation) => observation.freshness)).toEqual([
    'stale',
    'fresh',
    'fresh',
  ]);
  expect(observations[1]?.availability).toEqual({
    kind: 'unavailable',
    reason: 'missing-permission',
    missingScopes: ['pins:read'],
  });
  expect(observations[2]?.availability).toEqual({ kind: 'unsupported' });
  const [impressions, saves, clicks] = observations;
  if (!impressions || !saves || !clicks)
    throw new Error('Expected each requested Pinterest observation.');
  expect(areSocialAnalyticsObservationsComparable(impressions, saves)).toBeFalse();
  expect(areSocialAnalyticsObservationsComparable(impressions, clicks)).toBeFalse();
});

it('declares unsupported fields and accepts every supported provider', async () => {
  expect((await getSocialAnalyticsCapabilitiesAsync({ adapter, query }))[2]?.availability).toEqual({
    kind: 'unsupported',
  });
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

it('rejects observations outside the declared source capability', async () => {
  const [retrieval] = await adapter.retrieveAsync(query);
  if (!retrieval) throw new Error('Expected a source observation.');
  await assertCapabilityRejectionAsync(
    retrieveSocialAnalyticsAsync({
      ...input,
      adapter: {
        ...adapter,
        retrieveAsync: () =>
          Promise.resolve([
            { ...retrieval, provenance: { ...query.provenance, tenantId: 'tenant-b' } },
          ]),
      },
    }),
  );
});

it('compares observations only when their authorized source matches exactly', async () => {
  const [observation] = await retrieveSocialAnalyticsAsync(input);
  if (!observation) throw new Error('Expected a source observation.');
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

it('rejects values for unsupported or unavailable capabilities', async () => {
  const [retrieval] = await adapter.retrieveAsync(query);
  if (!retrieval) throw new Error('Expected a source observation.');
  for (const availability of [
    { kind: 'unsupported' as const },
    { kind: 'unavailable' as const, reason: 'not-ready' as const },
  ]) {
    const capabilityAdapter: SocialAnalyticsAdapter = {
      getCapabilitiesAsync: () =>
        Promise.resolve([{ provenance: query.provenance, metric: retrieval.metric, availability }]),
      retrieveAsync: () =>
        Promise.resolve([{ ...retrieval, availability: { kind: 'available', value: 42 } }]),
    };
    await assertCapabilityRejectionAsync(
      retrieveSocialAnalyticsAsync({
        ...input,
        adapter: capabilityAdapter,
        query: { ...query, providerMetricIds: [retrieval.metric.providerMetricId] },
      }),
    );
  }
});

const assertCapabilityRejectionAsync = async (operation: Promise<unknown>): Promise<void> => {
  try {
    await operation;
    throw new Error('Expected the available value to be rejected.');
  } catch (error: unknown) {
    if (!(error instanceof Error)) throw error;
    expect(error.message).toContain('outside the declared capability');
  }
};
