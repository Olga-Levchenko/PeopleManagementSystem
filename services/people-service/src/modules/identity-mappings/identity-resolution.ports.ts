export interface InternalServiceAuthorizationContext {
  readonly serviceName: string;
  readonly authenticationId: string;
}

export type InternalServiceAuthorizationResult =
  | {
      readonly outcome: 'authenticated';
      readonly context: InternalServiceAuthorizationContext;
    }
  | { readonly outcome: 'missing' }
  | { readonly outcome: 'unauthorized' };

export interface IInternalServiceAuthorizer {
  authorize(): Promise<InternalServiceAuthorizationResult>;
}

export type IdentityResolutionResult =
  | { readonly outcome: 'resolved'; readonly personId: string }
  | { readonly outcome: 'missing' }
  | { readonly outcome: 'ambiguous' }
  | { readonly outcome: 'unavailable' };
