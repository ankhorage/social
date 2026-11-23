/*** Provider-neutral social action dispatch, independent from OAuth and Flow orchestration. */
export { executeSocialActionAsync } from './features/actions/application/executeSocialActionAsync.js';
export type {
  SocialAction,
  SocialActionCommand,
  SocialExecutionDecision,
  SocialProviderPort,
  SocialReceipt,
} from './types/social.js';
