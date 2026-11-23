/*** Provider-neutral social action dispatch, independent from OAuth and Flow orchestration. */
export { executeSocialActionAsync } from './features/actions/application/executeSocialActionAsync.js';
export { areSocialAnalyticsObservationsComparable } from './features/analytics/domain/areSocialAnalyticsObservationsComparable.js';
export { getSocialAnalyticsCapabilitiesAsync } from './features/analytics/domain/getSocialAnalyticsCapabilitiesAsync.js';
export { retrieveSocialAnalyticsAsync } from './features/analytics/domain/retrieveSocialAnalyticsAsync.js';
export type {
  SocialAction,
  SocialActionCommand,
  SocialExecutionDecision,
  SocialProviderPort,
  SocialReceipt,
} from './types/social.js';
export type {
  SocialAnalyticsAdapter,
  SocialAnalyticsAvailability,
  SocialAnalyticsCapability,
  SocialAnalyticsFreshness,
  SocialAnalyticsMetricDefinition,
  SocialAnalyticsObservation,
  SocialAnalyticsProvenance,
  SocialAnalyticsProvider,
  SocialAnalyticsQuery,
  SocialAnalyticsReadInput,
  SocialAnalyticsRetrieval,
  SocialAnalyticsUnit,
  SocialAnalyticsWindow,
} from './types/socialAnalytics.js';
