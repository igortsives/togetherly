/**
 * Same-origin redirect allowlist used by `app/login/page.tsx`,
 * `submitBetaFeedbackAction` in `app/actions.ts`, and the NextAuth
 * `redirect` callback in `auth.ts`. Any post-auth or post-action
 * destination must pass through `sanitizeRedirectPath` so a crafted
 * `callbackUrl` / `route` cannot bounce a user off-domain or to an
 * unrelated in-app path.
 *
 * Resolves [#63](https://github.com/igortsives/togetherly/issues/63).
 */

export const ALLOWED_REDIRECT_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/review",
  "/windows",
  "/feedback"
]);

const FALLBACK_PATH = "/";

export function sanitizeRedirectPath(
  raw: string | null | undefined
): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return FALLBACK_PATH;
  }

  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return FALLBACK_PATH;
  }

  const [pathOnly] = raw.split(/[?#]/);
  if (!ALLOWED_REDIRECT_PATHS.has(pathOnly)) {
    return FALLBACK_PATH;
  }

  return raw;
}

export function isSameOriginUrl(url: string, baseOrigin: string): boolean {
  try {
    const target = new URL(url, baseOrigin);
    return target.origin === baseOrigin;
  } catch {
    return false;
  }
}
