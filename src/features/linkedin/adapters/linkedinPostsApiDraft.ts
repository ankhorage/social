/***
 * Records the verified LinkedIn Posts and media API boundary until Social exposes its stable provider port.
 *
 * This draft intentionally contains no OAuth credentials, network client, or public export. Sources: LinkedIn
 * Posts API, Images API, and Videos API documentation.
 */
export const linkedinPostsApiDraft = {
  state: 'blocked',
  blockers: [
    'A stable @ankhorage/social provider capability and media/operation boundary is not published.',
    'LinkedIn Community Management access and the required product approvals are not confirmed.',
  ],
  transport: {
    baseUrl: 'https://api.linkedin.com',
    requiredHeaders: {
      'Linkedin-Version': 'host-selected YYYYMM version',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  },
  publishing: {
    endpoint: '/rest/posts',
    method: 'POST',
    member: {
      author: 'urn:li:person:{memberId}',
      requiredScope: 'w_member_social',
    },
    organization: {
      author: 'urn:li:organization:{organizationId}',
      requiredScope: 'w_organization_social',
      requiredRoles: ['ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER', 'CONTENT_ADMIN'],
    },
    content: {
      text: 'Posts API commentary',
      link: 'explicit article fields; URL scraping is not supported',
      image: 'register and upload through /rest/images?action=initializeUpload before publishing',
      video: 'initialize, upload all parts, and finalize through /rest/videos before publishing',
    },
  },
  reads: {
    member: {
      requiredScope: 'r_member_social',
      access: 'restricted; approved API product required',
    },
    organization: {
      requiredScope: 'r_organization_social',
      requiredRoles: ['ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER', 'CONTENT_ADMIN'],
    },
    postById: '/rest/posts/{encodedPostUrn}?viewContext=AUTHOR',
  },
  engagementAndInsights: {
    commentsAndLikes: 'map only after approved product and individual scope confirmation',
    insights: 'not mapped by Posts API; requires separate approved provider capability',
  },
  mediaOwnership: {
    member: 'The authenticated member must match the media owner.',
    organization: 'Current organization ADMIN or DSC permission is required.',
  },
  recovery: {
    rateLimit: 'Honor HTTP 429 Retry-After before a new attempt.',
    idempotency: 'No LinkedIn idempotency guarantee is assumed.',
    ambiguousPost:
      'Do not retry; reconcile by receipt or authorized AUTHOR read before another side effect.',
    diagnostics: 'Never include tokens, upload URLs, or opaque authorization grants.',
  },
} as const;
