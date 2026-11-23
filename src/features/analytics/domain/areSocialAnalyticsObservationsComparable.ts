import type { SocialAnalyticsObservation } from '../../../types/socialAnalytics.js';

/*** Determines whether two observations have the same tenant-scoped source, provider-native metric definition, and measurement window. */
export const areSocialAnalyticsObservationsComparable = (
  left: SocialAnalyticsObservation,
  right: SocialAnalyticsObservation,
): boolean =>
  sameProvenance(left, right) &&
  left.metric.providerMetricId === right.metric.providerMetricId &&
  left.metric.meaning === right.metric.meaning &&
  left.metric.unit === right.metric.unit &&
  left.window.startedAt === right.window.startedAt &&
  left.window.endedAt === right.window.endedAt;

/*** Determines whether two observations originate from exactly the same authorized source. */
const sameProvenance = (
  left: SocialAnalyticsObservation,
  right: SocialAnalyticsObservation,
): boolean =>
  left.provenance.tenantId === right.provenance.tenantId &&
  left.provenance.provider === right.provenance.provider &&
  left.provenance.accountId === right.provenance.accountId &&
  left.provenance.targetId === right.provenance.targetId &&
  left.provenance.contentId === right.provenance.contentId;
