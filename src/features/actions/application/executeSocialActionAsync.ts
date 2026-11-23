import type {
  SocialAction,
  SocialActionCommand,
  SocialExecutionDecision,
  SocialProviderPort,
} from '../../../types/social.js';

/*** Validate and execute a social action through an explicit provider boundary. */
export const executeSocialActionAsync = async (
  command: SocialActionCommand,
  provider: SocialProviderPort,
): Promise<SocialExecutionDecision> => {
  if (
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

  const receipt = await provider.executeAsync(command);

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
