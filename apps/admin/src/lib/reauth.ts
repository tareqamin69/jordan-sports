'use client';

/**
 * Re-authentication prompt shared by all API calls: when the API answers REAUTH_REQUIRED, the
 * dialog (mounted once in the admin shell) asks for the password and code, then the call is
 * retried. Resolves false when the staff member cancels.
 */
type Listener = (request: { resolve: (ok: boolean) => void } | null) => void;

let listener: Listener | null = null;
let pending: Promise<boolean> | null = null;

export function onReauthRequest(l: Listener): () => void {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
}

export function requestReauth(): Promise<boolean> {
  if (!listener) return Promise.resolve(false);
  pending ??= new Promise<boolean>((resolve) => {
    listener?.({
      resolve: (ok) => {
        pending = null;
        listener?.(null);
        resolve(ok);
      },
    });
  });
  return pending;
}
