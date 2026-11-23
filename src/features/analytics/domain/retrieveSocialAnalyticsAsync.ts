import type {
  SocialAnalyticsCapability,
  SocialAnalyticsFreshness,
  SocialAnalyticsObservation,
  SocialAnalyticsReadInput,
  SocialAnalyticsRetrieval,
} from '../../../types/socialAnalytics';
import { getSocialAnalyticsCapabilitiesAsync } from './getSocialAnalyticsCapabilitiesAsync';

/*** Retrieves tenant-scoped provider-native observations without converting unlike provider metrics. */
export const retrieveSocialAnalyticsAsync = async (
  input: SocialAnalyticsReadInput,
): Promise<readonly SocialAnalyticsObservation[]> => {
  assertFreshnessInput(input);
  const capabilities = await getSocialAnalyticsCapabilitiesAsync(input);
  const retrievals = await input.adapter.retrieveAsync(input.query);

  return retrievals.map((retrieval) => createObservation(retrieval, capabilities, input));
};

/*** Validates freshness policy before adapter output can be interpreted. */
const assertFreshnessInput = (input: SocialAnalyticsReadInput): void => {
  if (
    !Number.isFinite(input.maximumAgeMs) ||
    input.maximumAgeMs < 0 ||
    Number.isNaN(Date.parse(input.observedAt))
  ) {
    throw new Error('Social analytics freshness input is invalid.');
  }
};

/*** Retains native observation data and derives freshness from the caller's explicit observation time. */
const createObservation = (
  retrieval: SocialAnalyticsRetrieval,
  capabilities: readonly SocialAnalyticsCapability[],
  input: SocialAnalyticsReadInput,
): SocialAnalyticsObservation => {
  const capability = capabilities.find(
    (candidate) => candidate.metric.providerMetricId === retrieval.metric.providerMetricId,
  );

  if (
    !capability ||
    !sameProvenance(retrieval.provenance, input.query.provenance) ||
    !sameMetric(retrieval, capability) ||
    !availabilityMatchesCapability(retrieval, capability)
  ) {
    throw new Error(
      'Social analytics adapter returned an observation outside the declared capability.',
    );
  }

  if (
    Number.isNaN(Date.parse(retrieval.retrievedAt)) ||
    Number.isNaN(Date.parse(retrieval.window.startedAt)) ||
    Number.isNaN(Date.parse(retrieval.window.endedAt)) ||
    Date.parse(retrieval.window.startedAt) > Date.parse(retrieval.window.endedAt)
  ) {
    throw new Error('Social analytics adapter returned invalid measurement timestamps.');
  }

  if (
    retrieval.availability.kind === 'available' &&
    !Number.isFinite(retrieval.availability.value)
  ) {
    throw new Error('Social analytics adapter returned an invalid metric value.');
  }

  return { ...retrieval, freshness: getFreshness(retrieval.retrievedAt, input) };
};

/*** Determines whether a retrieval's full provenance matches the requested tenant-scoped source. */
const sameProvenance = (
  left: SocialAnalyticsRetrieval['provenance'],
  right: SocialAnalyticsRetrieval['provenance'],
): boolean =>
  left.tenantId === right.tenantId &&
  left.provider === right.provider &&
  left.accountId === right.accountId &&
  left.targetId === right.targetId &&
  left.contentId === right.contentId;

/*** Preserves native identity by accepting observations only when their declared capability has the same meaning and unit. */
const sameMetric = (
  retrieval: SocialAnalyticsRetrieval,
  capability: SocialAnalyticsCapability,
): boolean =>
  retrieval.metric.providerMetricId === capability.metric.providerMetricId &&
  retrieval.metric.meaning === capability.metric.meaning &&
  retrieval.metric.unit === capability.metric.unit;

/*** Rejects available values for metrics the provider declared unsupported or unavailable. */
const availabilityMatchesCapability = (
  retrieval: SocialAnalyticsRetrieval,
  capability: SocialAnalyticsCapability,
): boolean =>
  capability.availability.kind === 'supported' || retrieval.availability.kind !== 'available';

/*** Classifies source data as stale only against an explicit caller-supplied freshness policy. */
const getFreshness = (
  retrievedAt: string,
  input: SocialAnalyticsReadInput,
): SocialAnalyticsFreshness =>
  Date.parse(input.observedAt) - Date.parse(retrievedAt) > input.maximumAgeMs ? 'stale' : 'fresh';
