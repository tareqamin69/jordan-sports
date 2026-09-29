import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    /** `toast`: shown (as a success toast) when the mutation succeeds — every save/delete says so. */
    mutationMeta: { toast?: string | ((data: unknown) => string) };
  }
}
