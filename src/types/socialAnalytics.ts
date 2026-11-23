export type SocialAnalyticsProvider = 'facebook' | 'instagram' | 'linkedin' | 'pinterest';

export type SocialAnalyticsUnit =
  'count' | 'currency' | 'duration-ms' | 'percentage' | 'ratio' | 'provider-defined';

export interface SocialAnalyticsProvenance {
  tenantId: string;
  provider: SocialAnalyticsProvider;
  accountId: string;
  targetId: string;
  contentId?: string;
}

export interface SocialAnalyticsWindow {
  startedAt: string;
  endedAt: string;
}

export interface SocialAnalyticsMetricDefinition {
  providerMetricId: string;
  meaning: string;
  unit: SocialAnalyticsUnit;
}

export type SocialAnalyticsAvailability =
  | { kind: 'available'; value: number }
  | { kind: 'unsupported' }
  | {
      kind: 'unavailable';
      reason: 'hidden' | 'missing-permission' | 'provider-unavailable' | 'not-ready';
      missingScopes?: readonly string[];
    };

export interface SocialAnalyticsCapability {
  provenance: SocialAnalyticsProvenance;
  metric: SocialAnalyticsMetricDefinition;
  availability:
    | { kind: 'supported' }
    | Exclude<SocialAnalyticsAvailability, { kind: 'available'; value: number }>;
}

export interface SocialAnalyticsRetrieval {
  provenance: SocialAnalyticsProvenance;
  metric: SocialAnalyticsMetricDefinition;
  window: SocialAnalyticsWindow;
  retrievedAt: string;
  availability: SocialAnalyticsAvailability;
}

export type SocialAnalyticsFreshness = 'fresh' | 'stale';

export type SocialAnalyticsObservation = SocialAnalyticsRetrieval & {
  freshness: SocialAnalyticsFreshness;
};

export interface SocialAnalyticsQuery {
  provenance: SocialAnalyticsProvenance;
  providerMetricIds: readonly string[];
}

export interface SocialAnalyticsAdapter {
  getCapabilitiesAsync: (
    query: SocialAnalyticsQuery,
  ) => Promise<readonly SocialAnalyticsCapability[]>;
  retrieveAsync: (query: SocialAnalyticsQuery) => Promise<readonly SocialAnalyticsRetrieval[]>;
}

export interface SocialAnalyticsReadInput {
  adapter: SocialAnalyticsAdapter;
  query: SocialAnalyticsQuery;
  observedAt: string;
  maximumAgeMs: number;
}
