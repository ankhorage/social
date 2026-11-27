import { expect, it } from 'bun:test';

import { linkedinPostsApiDraft } from './linkedinPostsApiDraft';

it('maps the mandatory versioned Posts API transport contract', () => {
  expect(linkedinPostsApiDraft.transport).toEqual({
    baseUrl: 'https://api.linkedin.com',
    requiredHeaders: {
      'Linkedin-Version': 'host-selected YYYYMM version',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  expect(linkedinPostsApiDraft.publishing).toMatchObject({
    endpoint: '/rest/posts',
    method: 'POST',
  });
});

it('separates member and organization grants and current roles', () => {
  expect(linkedinPostsApiDraft.publishing.member.requiredScope).toBe('w_member_social');
  expect(linkedinPostsApiDraft.publishing.organization).toEqual({
    author: 'urn:li:organization:{organizationId}',
    requiredScope: 'w_organization_social',
    requiredRoles: ['ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER', 'CONTENT_ADMIN'],
  });
});

it('does not claim restricted reads, engagement, or insights are available', () => {
  expect(linkedinPostsApiDraft.reads.member.access).toContain('restricted');
  expect(linkedinPostsApiDraft.engagementAndInsights.commentsAndLikes).toContain('approved');
  expect(linkedinPostsApiDraft.engagementAndInsights.insights).toContain('not mapped');
});

it('requires provider-owned media upload and fail-closed recovery', () => {
  expect(linkedinPostsApiDraft.publishing.content).toEqual({
    text: 'Posts API commentary',
    link: 'explicit article fields; URL scraping is not supported',
    image: 'register and upload through /rest/images?action=initializeUpload before publishing',
    video: 'initialize, upload all parts, and finalize through /rest/videos before publishing',
  });
  expect(linkedinPostsApiDraft.recovery).toMatchObject({
    rateLimit: 'Honor HTTP 429 Retry-After before a new attempt.',
    idempotency: 'No LinkedIn idempotency guarantee is assumed.',
  });
  expect(linkedinPostsApiDraft.recovery.ambiguousPost).toContain('Do not retry');
  expect(linkedinPostsApiDraft.recovery.diagnostics).not.toContain('Bearer');
});
