import type {
  SocialAction,
  SocialActionCommand,
  SocialAuthorizationPort,
  SocialExecutionDecision,
  SocialProviderPort,
} from '../../../types/social.js';

/*** Authorize and execute a social action through explicit replaceable boundaries. */
export const executeSocialActionAsync = async (
  command: SocialActionCommand,
  authorization: SocialAuthorizationPort,
  provider: SocialProviderPort,
): Promise<SocialExecutionDecision> => {
  if (
    command.connectionId.trim().length === 0 ||
    command.provider.trim().length === 0 ||
    command.idempotencyKey.trim().length === 0 ||
    !isValidSocialAction(command.action)
  ) {
    return { dispatched: false, reason: 'invalid-command' };
  }

  if (provider.provider !== command.provider) {
    return { dispatched: false, reason: 'provider-mismatch' };
  }

  if (!provider.supportedActions.includes(command.action.kind)) {
    return { dispatched: false, reason: 'unsupported-action' };
  }

  const grant = await authorization.authorizeAsync(command);

  if (grant === null || grant.authorizationRef.trim().length === 0) {
    return { dispatched: false, reason: 'connection-denied' };
  }

  const receipt = await provider.executeAsync(command, grant.authorizationRef);

  return { dispatched: true, receipt };
};

/*** Reject empty content before invoking an external provider. */
const isValidSocialAction = (action: SocialAction): boolean => {
  switch (action.kind) {
    case 'publish':
      return action.text.trim().length > 0;
    case 'comment':
      return action.targetId.trim().length > 0 && action.text.trim().length > 0;
    case 'react':
      return action.targetId.trim().length > 0 && action.reaction.trim().length > 0;
  }
};
