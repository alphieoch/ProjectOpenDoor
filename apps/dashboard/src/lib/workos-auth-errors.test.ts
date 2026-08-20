import { describe, expect, test } from "bun:test";
import {
  authErrorMessage,
  loginErrorLocation,
  sanitizeAuthErrorDetail,
  workosFailureCode,
  workosFailureDetail,
} from "./workos-auth-errors";

describe("WorkOS login errors", () => {
  test("maps workos_failed to the login-page copy", () => {
    expect(authErrorMessage("workos_failed")).toBe("Sign-in failed. Try again.");
    expect(authErrorMessage("invalid_grant")).toContain("already used");
  });

  test("puts a safe detail on the login URL", () => {
    expect(loginErrorLocation("http://localhost:3010", "workos_failed", "invalid_grant")).toBe(
      "http://localhost:3010/login?error=workos_failed&error_detail=invalid_grant"
    );
  });

  test("strips secrets-looking detail length", () => {
    expect(sanitizeAuthErrorDetail(`  ${"a".repeat(400)}  `).length).toBe(180);
  });

  test("extracts WorkOS API codes without dumping the raw object", () => {
    const error = {
      code: "invalid_grant",
      message: "The code has expired or already been used",
      rawData: { code: "invalid_grant", message: "The code has expired or already been used" },
    };
    expect(workosFailureCode(error)).toBe("invalid_grant");
    expect(workosFailureDetail(error)).toContain("expired");
  });
});
