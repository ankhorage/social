/*** Provider-neutral social operations; provider-specific payloads belong in adapters. */
export type SocialAction =
  | { readonly kind: 'publish'; readonly text: string }
  | { readonly kind: 'comment'; readonly targetId: string; readonly text: string }
  | { readonly kind: 'react'; readonly targetId: string; readonly reaction: string };

/*** One idempotent social operation dispatched to an explicitly selected provider. */
export interface SocialActionCommand {
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

/*** Provider adapter contract; adapters own authorization and enforce platform rules. */
export interface SocialProviderPort {
  readonly provider: string;
  readonly supportedActions: readonly SocialAction['kind'][];
  readonly executeAsync: (command: SocialActionCommand) => Promise<SocialReceipt>;
}

/*** The dispatch decision does not conceal provider execution errors or imply a durable receipt. */
export type SocialExecutionDecision =
  | { readonly dispatched: true; readonly receipt: SocialReceipt }
  | {
      readonly dispatched: false;
      readonly reason: 'invalid-command' | 'provider-mismatch' | 'unsupported-action';
    };
