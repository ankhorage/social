/*** A provider account and destination that must be bound by authorization and receipts. */
export interface SocialTargetRef {
  readonly provider: string;
  readonly accountId: string;
  readonly accountType: string;
  readonly destinationId: string;
  readonly destinationType: string;
}

/*** A media reference accepted only after an outer media boundary has validated its source. */
export interface SocialMediaRef {
  readonly mediaId: string;
  readonly kind: 'image' | 'video';
  readonly contentType: string;
  readonly byteLength: number;
}

/*** Provider-neutral social operations; provider-specific payloads belong in adapters. */
export type SocialAction =
  | {
      readonly kind: 'publish';
      readonly text?: string;
      readonly media?: readonly SocialMediaRef[];
      readonly link?: string;
    }
  | { readonly kind: 'comment' | 'reply'; readonly targetId: string; readonly text: string }
  | { readonly kind: 'react'; readonly targetId: string; readonly reaction: string }
  | { readonly kind: 'repost'; readonly targetId: string; readonly text?: string };

/*** One stable social effect that must be authorized and reconciled against its exact target. */
export interface SocialActionCommand {
  readonly operationKey: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly target: SocialTargetRef;
  readonly action: SocialAction;
}

/*** A provider-declared content class used by capability preflight. */
export type SocialContentType = 'text' | 'image' | 'video' | 'link' | 'carousel';

/*** The scopes currently required for one provider action. */
interface SocialActionCapability {
  readonly kind: SocialAction['kind'];
  readonly requiredScopes: readonly string[];
}

/*** Supported media shape and maximum bytes for one provider capability. */
interface SocialMediaCapability {
  readonly kind: SocialMediaRef['kind'];
  readonly contentTypes: readonly string[];
  readonly maxByteLength: number;
}

/*** Current provider capability for one account type and destination type. */
export interface SocialProviderCapability {
  readonly provider: string;
  readonly accountType: string;
  readonly destinationType: string;
  readonly enabled: boolean;
  readonly publishingAllowed: boolean;
  readonly actions: readonly SocialActionCapability[];
  readonly contentTypes: readonly SocialContentType[];
  readonly media: readonly SocialMediaCapability[];
  readonly maxTextLength?: number;
  readonly maxMediaItems?: number;
}

/*** A diagnostic intentionally limited to a stable code and optional retry delay. */
interface SocialDiagnostic {
  readonly code: string;
  readonly retryAfterSeconds?: number;
}

/*** A trusted decision that proves authorization for exactly one operation and target. */
export type SocialAuthorizationDecision =
  | {
      readonly authorized: true;
      readonly authorizationRef: string;
      readonly operationKey: string;
      readonly tenantId: string;
      readonly actorId: string;
      readonly target: SocialTargetRef;
      readonly scopes: readonly string[];
    }
  | {
      readonly authorized: false;
      readonly reason: 'denied' | 'expired';
      readonly diagnostic?: SocialDiagnostic;
    };

/*** A current authorization check owned by the host and trusted by Social. */
export interface SocialAuthorizationPort {
  readonly authorizeAsync: (command: SocialActionCommand) => Promise<SocialAuthorizationDecision>;
}

/*** An outer media boundary that validates media references without accepting URLs or blobs. */
export interface SocialMediaPreflightPort {
  readonly preflightAsync: (
    command: SocialActionCommand,
    media: readonly SocialMediaRef[],
  ) => Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly diagnostic?: SocialDiagnostic }
  >;
}

/*** A receipt whose operation and target identity are stable across execution and reconciliation. */
export interface SocialReceipt {
  readonly receiptId: string;
  readonly operationKey: string;
  readonly target: SocialTargetRef;
  readonly resourceId?: string;
  readonly resourceUrl?: string;
}

/*** Durable reconciliation state owned by the concrete provider adapter. */
type SocialReconciliationDecision =
  | { readonly state: 'found'; readonly receipt: SocialReceipt }
  | { readonly state: 'absent' }
  | { readonly state: 'ambiguous'; readonly diagnostic?: SocialDiagnostic };

/*** One provider execution outcome, with ambiguity deliberately distinct from failure. */
export type SocialProviderExecutionDecision =
  | { readonly state: 'completed'; readonly receipt: SocialReceipt }
  | {
      readonly state:
        'denied' | 'unsupported' | 'expired' | 'rate-limited' | 'ambiguous' | 'provider-failed';
      readonly diagnostic?: SocialDiagnostic;
    };

/*** Provider adapter contract; adapters own concrete capability discovery, reconciliation, and execution. */
export interface SocialProviderPort {
  readonly provider: string;
  readonly getCapabilityAsync: (
    target: SocialTargetRef,
  ) => Promise<SocialProviderCapability | null>;
  readonly reconcileAsync: (
    command: SocialActionCommand,
    authorizationRef: string,
  ) => Promise<SocialReconciliationDecision>;
  readonly executeAsync: (
    command: SocialActionCommand,
    authorizationRef: string,
  ) => Promise<SocialProviderExecutionDecision>;
}

/*** The dispatch decision never exposes provider response bodies or implies exactly-once delivery. */
export type SocialExecutionDecision =
  | {
      readonly dispatched: true;
      readonly status: 'executed' | 'reconciled';
      readonly receipt: SocialReceipt;
    }
  | {
      readonly dispatched: false;
      readonly reason:
        | 'invalid-command'
        | 'provider-mismatch'
        | 'unsupported'
        | 'media-invalid'
        | 'denied'
        | 'expired'
        | 'rate-limited'
        | 'ambiguous'
        | 'provider-failed';
      readonly diagnostic?: SocialDiagnostic;
    };
