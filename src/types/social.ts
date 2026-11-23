/*** Provider-neutral social operations; provider-specific payloads belong in adapters. */
export type SocialAction =
  | { readonly kind: 'publish'; readonly text: string }
  | { readonly kind: 'comment'; readonly targetId: string; readonly text: string }
  | { readonly kind: 'react'; readonly targetId: string; readonly reaction: string };

/*** One idempotent social operation against an explicitly linked account. */
export interface SocialActionCommand {
  readonly connectionId: string;
  readonly provider: string;
  readonly idempotencyKey: string;
  readonly action: SocialAction;
}

/*** Receipt supplied by the provider adapter; persistence and deduplication stay adapter-owned. */
export interface SocialReceipt {
  readonly receiptId: string;
  readonly resourceId?: string;
  readonly resourceUrl?: string;
}

/*** An authorization check owned by the host connection layer, never by the social feature. */
export interface SocialAuthorizationPort {
  readonly authorizeAsync: (
    command: SocialActionCommand,
  ) => Promise<{ readonly authorizationRef: string } | null>;
}

/*** Provider adapter contract; adapters resolve opaque references and enforce platform rules. */
export interface SocialProviderPort {
  readonly provider: string;
  readonly supportedActions: readonly SocialAction['kind'][];
  readonly executeAsync: (
    command: SocialActionCommand,
    authorizationRef: string,
  ) => Promise<SocialReceipt>;
}

/*** The dispatch decision does not conceal provider execution errors or imply a durable receipt. */
export type SocialExecutionDecision =
  | { readonly dispatched: true; readonly receipt: SocialReceipt }
  | {
      readonly dispatched: false;
      readonly reason:
        'invalid-command' | 'provider-mismatch' | 'unsupported-action' | 'connection-denied';
    };
