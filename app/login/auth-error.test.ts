import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./page";

describe("authErrorMessage", () => {
  it("treats Configuration as a friendly cancel/incomplete (covers Google Cancel)", () => {
    expect(authErrorMessage("Configuration")).toMatch(
      /cancelled|cancel/i
    );
  });

  it("treats OAuthCallback and OAuthSignin as the same family as Configuration", () => {
    const expected = authErrorMessage("Configuration");
    expect(authErrorMessage("OAuthCallback")).toBe(expected);
    expect(authErrorMessage("OAuthSignin")).toBe(expected);
  });

  it("explains OAuthAccountNotLinked specifically (#116)", () => {
    expect(authErrorMessage("OAuthAccountNotLinked")).toMatch(
      /already linked|different sign-in method/i
    );
  });

  it("explains AccessDenied for workspace policy blocks", () => {
    expect(authErrorMessage("AccessDenied")).toMatch(/workspace|admin/i);
  });

  it("keeps the credentials-signin copy for email/password failure", () => {
    expect(authErrorMessage("CredentialsSignin")).toMatch(
      /email and password/i
    );
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(authErrorMessage("SomeNewCodeNextAuthInvents")).toMatch(
      /try again/i
    );
  });
});
