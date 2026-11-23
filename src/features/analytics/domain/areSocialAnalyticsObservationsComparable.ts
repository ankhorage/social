import type { SocialAnalyticsObservation } from '../../../types/socialAnalytics';

/*** Determines whether two observations have identical provider-native metric definitions and measurement windows. */
export const areSocialAnalyticsObservationsComparable = (
  left: SocialAnalyticsObservation,
  right: SocialAnalyticsObservation,
): boolean =>
  left.provenance.provider === right.provenance.provider &&
  left.metric.providerMetricId === right.metric.providerMetricId &&
  left.metric.meaning === right.metric.meaning &&
  left.metric.unit === right.metric.unit &&
  left.window.startedAt === right.window.startedAt &&
  left.window.endedAt === right.window.endedAt;
