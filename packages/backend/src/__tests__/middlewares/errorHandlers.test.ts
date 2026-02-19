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

import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { AppError, errorHandler } from "../../middlewares/errorHandlers";

describe("errorHandler middleware", () => {
  it("responds with the error statusCode and message", async () => {
    const app = express();
    app.get("/fail", (_req: Request, _res: Response, next: NextFunction) => {
      next(new AppError("Something broke", 422));
    });
    app.use(errorHandler);

    const response = await request(app).get("/fail");

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Something broke");
  });

  it("defaults to 500 when no statusCode is set", async () => {
    const app = express();
    app.get("/fail", (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error("generic error"));
    });
    app.use(errorHandler);

    const response = await request(app).get("/fail");

    expect(response.status).toBe(500);
  });

  it("is recognized as an Express error handler (4 parameters)", () => {
    // Express requires error handlers to have exactly 4 parameters
    expect(errorHandler.length).toBe(4);
  });
});
