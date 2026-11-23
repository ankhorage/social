import type {
  SocialAnalyticsCapability,
  SocialAnalyticsQuery,
} from '../../../types/socialAnalytics';

/*** Gets the provider-native metric capabilities for a tenant-scoped source. */
export const getSocialAnalyticsCapabilitiesAsync = async (input: {
  adapter: {
    getCapabilitiesAsync: (
      query: SocialAnalyticsQuery,
    ) => Promise<readonly SocialAnalyticsCapability[]>;
  };
  query: SocialAnalyticsQuery;
}): Promise<readonly SocialAnalyticsCapability[]> => {
  const capabilities = await input.adapter.getCapabilitiesAsync(input.query);

  capabilities.forEach((capability) => {
    assertCapabilityMatchesQuery(capability, input.query);
  });
  assertEveryRequestedMetricHasCapability(capabilities, input.query);

  return capabilities;
};

/*** Rejects adapter capability data that crosses the requested tenant or provider provenance boundary. */
const assertCapabilityMatchesQuery = (
  capability: SocialAnalyticsCapability,
  query: SocialAnalyticsQuery,
): void => {
  if (
    !provenanceMatches(capability.provenance, query.provenance) ||
    !query.providerMetricIds.includes(capability.metric.providerMetricId)
  ) {
    throw new Error(
      'Social analytics adapter returned a capability outside the requested provenance.',
    );
  }
};

/*** Rejects an adapter response that omits a requested metric instead of declaring its capability. */
const assertEveryRequestedMetricHasCapability = (
  capabilities: readonly SocialAnalyticsCapability[],
  query: SocialAnalyticsQuery,
): void => {
  const capabilityMetricIds = new Set(
    capabilities.map((capability) => capability.metric.providerMetricId),
  );

  if (
    query.providerMetricIds.some((providerMetricId) => !capabilityMetricIds.has(providerMetricId))
  ) {
    throw new Error('Social analytics adapter did not declare every requested metric capability.');
  }
};

/*** Determines whether adapter output belongs exactly to the requested tenant-scoped source. */
const provenanceMatches = (
  left: SocialAnalyticsQuery['provenance'],
  right: SocialAnalyticsQuery['provenance'],
): boolean =>
  left.tenantId === right.tenantId &&
  left.provider === right.provider &&
  left.accountId === right.accountId &&
  left.targetId === right.targetId &&
  left.contentId === right.contentId;
