/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import express, { Request, Response } from "express";
import request from "supertest";
import { createPortalTimeoutMiddleware } from "../../middlewares/portalTimeout";

describe("createPortalTimeoutMiddleware", () => {
  it("returns 504 when request exceeds the timeout", async () => {
    const app = express();
    // Use a very short real timeout — no fake timers needed
    app.use(createPortalTimeoutMiddleware(50));
    app.get("/slow", (_req: Request, _res: Response) => {
      // Handler never sends a response — simulating a hung request
    });

    const response = await request(app).get("/slow");
    expect(response.status).toBe(504);
    expect(response.body).toEqual({ error: "Request timeout", code: "PORTAL_TIMEOUT" });
  }, 10000);

  it("passes through when request completes within timeout", async () => {
    const app = express();
    app.use(createPortalTimeoutMiddleware(5000));
    app.get("/fast", (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get("/fast");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("clears the timeout when response finishes normally", async () => {
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    const app = express();
    app.use(createPortalTimeoutMiddleware(5000));
    app.get("/normal", (_req: Request, res: Response) => {
      res.status(200).json({ done: true });
    });

    await request(app).get("/normal");

    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it("does not send timeout response when request already completed", async () => {
    const app = express();
    app.use(createPortalTimeoutMiddleware(100));
    app.get("/done", (_req: Request, res: Response) => {
      res.status(200).json({ done: true });
    });

    const response = await request(app).get("/done");
    expect(response.status).toBe(200);
  });

  it("sets timedOut flag on request when timeout fires", async () => {
    let capturedTimedOut: boolean | undefined;

    const app = express();
    app.use(createPortalTimeoutMiddleware(50));
    app.get("/slow", (req: Request, _res: Response) => {
      // Wait for the timeout to fire, then check the flag
      setTimeout(() => {
        capturedTimedOut = (req as unknown as Record<string, unknown>).timedOut as boolean;
      }, 100);
    });

    await request(app).get("/slow");

    // Give the inner setTimeout time to execute
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(capturedTimedOut).toBe(true);
  }, 10000);
});
