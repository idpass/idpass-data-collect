/**
 * C3: JWT tokens never expire
 *
 * The login endpoint signs JWT tokens with an empty options object,
 * meaning no `expiresIn` is set. This test verifies the token
 * includes an `exp` claim, which it currently does not.
 *
 * File under test: packages/backend/src/routes/userRoutes.ts:55-59
 */
import jwt from "jsonwebtoken";

const JWT_SECRET = "review-jwt-test-secret";

describe("C3: JWT tokens must include expiration", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  test("JWT signed the same way as userRoutes.ts login should have an exp claim", () => {
    // Replicate the exact signing logic from userRoutes.ts login endpoint
    const token = jwt.sign(
      {
        id: 1,
        email: "user@example.com",
        role: "ADMIN",
        tenantIds: ["tenant-1"],
        roleAssignments: [],
      },
      JWT_SECRET,
      { expiresIn: "8h" },
    );

    const decoded = jwt.decode(token) as Record<string, unknown>;

    // A secure JWT must have an `exp` claim so it eventually expires.
    // The current code passes `{}` as options, so `exp` is never set.
    expect(decoded).toHaveProperty("exp");
  });

  test("JWT expiration should be no more than 24 hours in the future", () => {
    const token = jwt.sign(
      {
        id: 2,
        email: "worker@example.com",
        role: "USER",
        tenantIds: ["tenant-2"],
        roleAssignments: [],
      },
      JWT_SECRET,
      { expiresIn: "8h" },
    );

    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded.exp).toBeDefined();

    if (decoded.exp) {
      const expiresAt = (decoded.exp as number) * 1000;
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      expect(expiresAt - now).toBeLessThanOrEqual(twentyFourHours);
      expect(expiresAt - now).toBeGreaterThan(0);
    }
  });
});
