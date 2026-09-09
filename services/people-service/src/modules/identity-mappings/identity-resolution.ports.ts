export type IdentityResolutionResult =
  | { readonly outcome: 'resolved'; readonly personId: string }
  | { readonly outcome: 'missing' }
  | { readonly outcome: 'ambiguous' }
  | { readonly outcome: 'unavailable' };
