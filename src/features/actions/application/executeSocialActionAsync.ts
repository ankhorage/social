import type {
  SocialAction,
  SocialActionCommand,
  SocialAuthorizationDecision,
  SocialAuthorizationPort,
  SocialContentType,
  SocialExecutionDecision,
  SocialMediaPreflightPort,
  SocialMediaRef,
  SocialProviderCapability,
  SocialProviderExecutionDecision,
  SocialProviderPort,
  SocialReceipt,
  SocialTargetRef,
} from '../../../types/social.js';

/*** Preflight, authorize, reconcile, and execute one provider-neutral social effect. */
export const executeSocialActionAsync = async (
  command: SocialActionCommand,
  authorization: SocialAuthorizationPort,
  mediaPreflight: SocialMediaPreflightPort,
  provider: SocialProviderPort,
): Promise<SocialExecutionDecision> => {
  if (!isValidCommand(command)) {
    return { dispatched: false, reason: 'invalid-command' };
  }

  if (provider.provider !== command.target.provider) {
    return { dispatched: false, reason: 'provider-mismatch' };
  }

  const initialCapability = await getPreflightedCapabilityAsync(command, provider);
  if ('decision' in initialCapability) {
    return initialCapability.decision;
  }
  const mediaDecision = await preflightMediaAsync(command, mediaPreflight);
  if (mediaDecision !== null) {
    return mediaDecision;
  }

  const grant = await authorization.authorizeAsync(command);
  if (!grant.authorized) {
    return { dispatched: false, reason: grant.reason, diagnostic: grant.diagnostic };
  }
  const authorizationFailure = validateAuthorization(command, grant, initialCapability.capability);
  if (authorizationFailure !== null) {
    return authorizationFailure;
  }

  const currentCapability = await getPreflightedCapabilityAsync(command, provider);
  if ('decision' in currentCapability) {
    return currentCapability.decision;
  }

  return reconcileAndExecuteAsync(command, grant.authorizationRef, provider);
};

/*** Read the current provider capability and turn every unsupported state into a fail-closed decision. */
const getPreflightedCapabilityAsync = async (
  command: SocialActionCommand,
  provider: SocialProviderPort,
): Promise<
  { readonly capability: SocialProviderCapability } | { readonly decision: SocialExecutionDecision }
> => {
  const capability = await provider.getCapabilityAsync(command.target);
  const decision = preflightCapability(command, capability);
  if (decision !== null) {
    return { decision };
  }
  if (capability === null) {
    return { decision: { dispatched: false, reason: 'unsupported' } };
  }
  return { capability };
};

/*** Ask the outer media boundary to resolve opaque media references before authorization. */
const preflightMediaAsync = async (
  command: SocialActionCommand,
  mediaPreflight: SocialMediaPreflightPort,
): Promise<SocialExecutionDecision | null> => {
  const media = command.action.kind === 'publish' ? (command.action.media ?? []) : [];
  if (media.length === 0) {
    return null;
  }
  const decision = await mediaPreflight.preflightAsync(command, media);
  return decision.accepted
    ? null
    : { dispatched: false, reason: 'media-invalid', diagnostic: decision.diagnostic };
};

/*** Reconcile a stable operation before the one allowed provider execution attempt. */
const reconcileAndExecuteAsync = async (
  command: SocialActionCommand,
  authorizationRef: string,
  provider: SocialProviderPort,
): Promise<SocialExecutionDecision> => {
  const reconciliation = await provider.reconcileAsync(command, authorizationRef);
  if (reconciliation.state === 'found') {
    return isMatchingReceipt(command, reconciliation.receipt)
      ? { dispatched: true, status: 'reconciled', receipt: reconciliation.receipt }
      : providerFailed('receipt-binding-invalid');
  }
  if (reconciliation.state === 'ambiguous') {
    return { dispatched: false, reason: 'ambiguous', diagnostic: reconciliation.diagnostic };
  }

  const execution = await provider.executeAsync(command, authorizationRef);
  return execution.state === 'completed'
    ? completeExecution(command, execution.receipt)
    : failedExecution(execution);
};

/*** Validate caller-owned identifiers and action content before invoking any port. */
const isValidCommand = (command: SocialActionCommand): boolean =>
  hasText(command.operationKey) &&
  hasText(command.tenantId) &&
  hasText(command.actorId) &&
  isValidTarget(command.target) &&
  isValidSocialAction(command.action);

/*** Validate the account and destination reference that an external effect would target. */
const isValidTarget = (target: SocialTargetRef): boolean =>
  hasText(target.provider) &&
  hasText(target.accountId) &&
  hasText(target.accountType) &&
  hasText(target.destinationId) &&
  hasText(target.destinationType);

/*** Validate action-local inputs while deliberately accepting only opaque media references. */
const isValidSocialAction = (action: SocialAction): boolean => {
  switch (action.kind) {
    case 'publish':
      return isValidPublishAction(action);
    case 'comment':
    case 'reply':
      return hasText(action.targetId) && hasText(action.text);
    case 'react':
      return hasText(action.targetId) && hasText(action.reaction);
    case 'repost':
      return hasText(action.targetId) && (action.text === undefined || hasText(action.text));
  }
};

/*** Validate publish content without allowing empty text, arbitrary media payloads, or insecure links. */
const isValidPublishAction = (
  action: Extract<SocialAction, { readonly kind: 'publish' }>,
): boolean =>
  (action.text === undefined || hasText(action.text)) &&
  (action.link === undefined || isHttpsUrl(action.link)) &&
  (action.media?.every(isValidMediaRef) ?? true) &&
  (action.text !== undefined || action.link !== undefined || (action.media?.length ?? 0) > 0);

/*** Reject malformed media metadata before the outer media boundary resolves its opaque ID. */
const isValidMediaRef = (media: SocialMediaRef): boolean =>
  hasText(media.mediaId) && hasText(media.contentType) && media.byteLength > 0;

/*** Apply the current provider capability matrix before requesting or using a grant. */
const preflightCapability = (
  command: SocialActionCommand,
  capability: SocialProviderCapability | null,
): SocialExecutionDecision | null => {
  if (capability === null) {
    return { dispatched: false, reason: 'unsupported' };
  }
  if (
    capability.provider !== command.target.provider ||
    capability.accountType !== command.target.accountType ||
    capability.destinationType !== command.target.destinationType ||
    !capability.enabled ||
    !capability.publishingAllowed
  ) {
    return { dispatched: false, reason: 'unsupported' };
  }

  if (
    !capability.actions.some(({ kind }) => kind === command.action.kind) ||
    !supportsContent(command, capability) ||
    !supportsMedia(command, capability)
  ) {
    return { dispatched: false, reason: 'unsupported' };
  }

  return null;
};

/*** Ensure the current capability admits every content class in the action. */
const supportsContent = (
  command: SocialActionCommand,
  capability: SocialProviderCapability,
): boolean =>
  getContentTypes(command.action).every((contentType) =>
    capability.contentTypes.includes(contentType),
  ) &&
  (capability.maxTextLength === undefined ||
    getText(command.action).length <= capability.maxTextLength);

/*** Ensure each media reference fits the current provider limit and supported content type. */
const supportsMedia = (
  command: SocialActionCommand,
  capability: SocialProviderCapability,
): boolean => {
  const media = command.action.kind === 'publish' ? (command.action.media ?? []) : [];
  return (
    (capability.maxMediaItems === undefined || media.length <= capability.maxMediaItems) &&
    media.every((item) => {
      const supported = capability.media.find(({ kind }) => kind === item.kind);
      return (
        supported !== undefined &&
        supported.contentTypes.includes(item.contentType) &&
        item.byteLength <= supported.maxByteLength
      );
    })
  );
};

/*** Derive provider-neutral content classes without leaking provider payload formats. */
const getContentTypes = (action: SocialAction): readonly SocialContentType[] => {
  if (action.kind !== 'publish') {
    return ['text'];
  }
  const media = action.media ?? [];
  return [
    ...(action.text === undefined ? [] : ['text' as const]),
    ...(action.link === undefined ? [] : ['link' as const]),
    ...(media.some(({ kind }) => kind === 'image') ? ['image' as const] : []),
    ...(media.some(({ kind }) => kind === 'video') ? ['video' as const] : []),
    ...(media.length > 1 ? ['carousel' as const] : []),
  ];
};

/*** Obtain the text subject to a provider character limit. */
const getText = (action: SocialAction): string =>
  action.kind === 'publish' || action.kind === 'repost'
    ? (action.text ?? '')
    : action.kind === 'react'
      ? action.reaction
      : action.text;

/*** Verify a trusted authorization response binds every caller-visible security identity. */
const validateAuthorization = (
  command: SocialActionCommand,
  grant: Extract<SocialAuthorizationDecision, { readonly authorized: true }>,
  capability: SocialProviderCapability,
): SocialExecutionDecision | null => {
  const actionCapability = capability.actions.find(({ kind }) => kind === command.action.kind);
  if (
    !hasText(grant.authorizationRef) ||
    grant.operationKey !== command.operationKey ||
    grant.tenantId !== command.tenantId ||
    grant.actorId !== command.actorId ||
    !isSameTarget(grant.target, command.target) ||
    !actionCapability?.requiredScopes.every((scope) => grant.scopes.includes(scope))
  ) {
    return { dispatched: false, reason: 'denied' };
  }
  return null;
};

/*** Match a receipt to the operation and target whose effect it proves. */
const isMatchingReceipt = (command: SocialActionCommand, receipt: SocialReceipt): boolean =>
  hasText(receipt.receiptId) &&
  receipt.operationKey === command.operationKey &&
  isSameTarget(receipt.target, command.target);

/*** Preserve completed receipts only when they prove the requested operation and target. */
const completeExecution = (
  command: SocialActionCommand,
  receipt: SocialReceipt,
): SocialExecutionDecision =>
  isMatchingReceipt(command, receipt)
    ? { dispatched: true, status: 'executed', receipt }
    : providerFailed('receipt-binding-invalid');

/*** Map provider outcomes into redacted, retry-safe execution decisions. */
const failedExecution = (
  execution: Exclude<SocialProviderExecutionDecision, { readonly state: 'completed' }>,
): SocialExecutionDecision => ({
  dispatched: false,
  reason: execution.state,
  diagnostic: execution.diagnostic,
});

/*** Create a redacted provider failure without exposing provider responses. */
const providerFailed = (code: string): SocialExecutionDecision => ({
  dispatched: false,
  reason: 'provider-failed',
  diagnostic: { code },
});

/*** Compare every target component so a syntactically valid target never becomes a grant. */
const isSameTarget = (left: SocialTargetRef, right: SocialTargetRef): boolean =>
  left.provider === right.provider &&
  left.accountId === right.accountId &&
  left.accountType === right.accountType &&
  left.destinationId === right.destinationId &&
  left.destinationType === right.destinationType;

/*** Require non-blank identifiers and textual content. */
const hasText = (value: string): boolean => value.trim().length > 0;

/*** Permit only explicit HTTPS links in provider-neutral social content. */
const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
