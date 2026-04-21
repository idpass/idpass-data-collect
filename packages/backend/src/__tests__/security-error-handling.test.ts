/**
 * Security test: Express error handler has wrong arity (3 params instead of 4)
 *
 * Vulnerability: The errorHandler function in errorHandlers.ts has the signature
 * `(err, req, res)` with 3 parameters. Express requires error-handling middleware
 * to have EXACTLY 4 parameters `(err, req, res, next)` to be recognized as an
 * error handler. With 3 parameters, Express treats it as a regular middleware
 * and will not route `next(error)` calls to it.
 *
 * This means when asyncHandler catches a thrown error and calls `next(error)`,
 * the errorHandler is skipped, and Express falls through to its built-in error
 * handler which sends an HTML response with a stack trace.
 *
 * This test MUST FAIL against the current codebase.
 */
import express, { Request, Response } from "express";
import request from "supertest";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return {
    createLogger: () => silentLogger.child({ component: "test" }),
    logger: silentLogger,
  };
});

import { errorHandler, asyncHandler, AppError } from "../middlewares/errorHandlers";

describe("SECURITY: Express error handler arity", () => {
  test("errorHandler function should have exactly 4 parameters for Express to recognize it", () => {
    // Express uses Function.length to determine if a middleware is an error handler.
    // Error handlers MUST have exactly 4 parameters: (err, req, res, next).
    // If there are fewer than 4, Express treats it as a regular middleware
    // and will never route errors to it.

    // EXPECTED (correct): errorHandler.length === 4
    // ACTUAL (broken): errorHandler.length === 3 because the function signature
    // is `(err, req, res)` without the `next` parameter
    expect(errorHandler.length).toBe(4);
  });

  test("errors passed via next(error) should be caught by errorHandler and return JSON", async () => {
    // Build a minimal Express app that mimics the syncServer setup
    const app = express();

    // A route that throws an error via asyncHandler
    app.get(
      "/test-error",
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      asyncHandler(async (_req: Request, _res: Response) => {
        throw new AppError("Something went wrong", 422);
      }),
    );

    // Mount the error handler the same way syncServer.ts does
    app.use(errorHandler);

    const response = await request(app).get("/test-error");

    // EXPECTED (correct): errorHandler catches the error and returns JSON
    // with status 422 and message "Something went wrong"
    // ACTUAL (broken): Express's built-in error handler catches it instead,
    // returning an HTML response with stack trace because errorHandler
    // has 3 params and is not recognized as an error handler
    expect(response.status).toBe(422);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body.message).toBe("Something went wrong");
  });

  test("next(error) with a generic Error should return 500 JSON response", async () => {
    const app = express();

    app.get(
      "/test-generic-error",
      asyncHandler(async () => {
        throw new Error("Internal failure");
      }),
    );

    app.use(errorHandler);

    const response = await request(app).get("/test-generic-error");

    // EXPECTED (correct): 500 JSON response with "Internal failure" message
    // ACTUAL (broken): HTML error page from Express default handler
    expect(response.status).toBe(500);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body.message).toBe("Internal failure");
  });

  test("error handler should NOT expose stack traces in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const app = express();

    app.get(
      "/test-prod-error",
      asyncHandler(async () => {
        throw new AppError("Sensitive operation failed", 500);
      }),
    );

    app.use(errorHandler);

    const response = await request(app).get("/test-prod-error");

    process.env.NODE_ENV = originalEnv;

    // EXPECTED: JSON response without stack trace
    // ACTUAL: If errorHandler is not invoked (wrong arity), Express default
    // handler returns HTML with stack trace regardless of NODE_ENV
    expect(response.status).toBe(500);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body.stack).toBeUndefined();
  });
});
