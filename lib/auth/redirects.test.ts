import { describe, expect, it } from "vitest";
import { isSameOriginUrl, sanitizeRedirectPath } from "./redirects";

describe("sanitizeRedirectPath", () => {
  it("accepts allowlisted paths", () => {
    expect(sanitizeRedirectPath("/")).toBe("/");
    expect(sanitizeRedirectPath("/review")).toBe("/review");
    expect(sanitizeRedirectPath("/windows")).toBe("/windows");
    expect(sanitizeRedirectPath("/feedback")).toBe("/feedback");
  });

  it("preserves a query string on an allowlisted path", () => {
    expect(sanitizeRedirectPath("/windows?searchId=abc123")).toBe(
      "/windows?searchId=abc123"
    );
    expect(sanitizeRedirectPath("/review#first")).toBe("/review#first");
  });

  it("rejects external absolute URLs", () => {
    expect(sanitizeRedirectPath("https://evil.com/phish")).toBe("/");
    expect(sanitizeRedirectPath("http://evil.com")).toBe("/");
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeRedirectPath("data:text/html,evil")).toBe("/");
  });

  it("rejects protocol-relative URLs that could escape origin", () => {
    expect(sanitizeRedirectPath("//evil.com")).toBe("/");
    expect(sanitizeRedirectPath("//evil.com/path")).toBe("/");
  });

  it("rejects unknown in-app paths", () => {
    expect(sanitizeRedirectPath("/admin")).toBe("/");
    expect(sanitizeRedirectPath("/api/auth/csrf")).toBe("/");
    expect(sanitizeRedirectPath("/some/nested/route")).toBe("/");
  });

  it("falls back on null, undefined, empty", () => {
    expect(sanitizeRedirectPath(null)).toBe("/");
    expect(sanitizeRedirectPath(undefined)).toBe("/");
    expect(sanitizeRedirectPath("")).toBe("/");
  });

  it("falls back on non-string input", () => {
    expect(sanitizeRedirectPath(42 as unknown as string)).toBe("/");
    expect(sanitizeRedirectPath({} as unknown as string)).toBe("/");
  });
});

describe("isSameOriginUrl", () => {
  const baseOrigin = "https://togetherly.example.com";

  it("returns true for absolute same-origin URLs", () => {
    expect(isSameOriginUrl(`${baseOrigin}/`, baseOrigin)).toBe(true);
    expect(isSameOriginUrl(`${baseOrigin}/review`, baseOrigin)).toBe(true);
  });

  it("returns true for relative paths", () => {
    expect(isSameOriginUrl("/", baseOrigin)).toBe(true);
    expect(isSameOriginUrl("/anything", baseOrigin)).toBe(true);
  });

  it("returns false for absolute cross-origin URLs", () => {
    expect(isSameOriginUrl("https://evil.com/phish", baseOrigin)).toBe(false);
    expect(isSameOriginUrl("http://togetherly.example.com/", baseOrigin)).toBe(
      false
    );
  });

  it("treats bare strings as relative paths under the base origin", () => {
    // The URL constructor resolves "not a url" against baseOrigin to
    // `${baseOrigin}/not%20a%20url`, which is same-origin. We accept
    // that behaviour rather than reinventing parsing.
    expect(isSameOriginUrl("not a url", baseOrigin)).toBe(true);
    // Empty string resolves to baseOrigin in URL constructor.
    expect(isSameOriginUrl("", baseOrigin)).toBe(true);
  });

  it("returns false when the URL constructor throws", () => {
    // An invalid base origin will cause the constructor to throw.
    expect(isSameOriginUrl("https://togetherly.example.com/", "")).toBe(false);
  });
});
