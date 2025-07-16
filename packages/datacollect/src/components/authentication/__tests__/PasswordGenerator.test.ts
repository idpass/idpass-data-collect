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

import { generatePassword } from "../PasswordGenerator";

describe("PasswordGenerator", () => {
  describe("generatePassword", () => {
    it("should generate a password with default length of 20", () => {
      const password = generatePassword();
      expect(password).toHaveLength(20);
    });

    it("should generate a password with custom length", () => {
      const password = generatePassword(12);
      expect(password).toHaveLength(12);
    });

    it("should generate a password with minimum length of 4", () => {
      const password = generatePassword(4);
      expect(password).toHaveLength(4);
    });

    it("should contain at least one uppercase letter", () => {
      const password = generatePassword(20);
      expect(password).toMatch(/[A-Z]/);
    });

    it("should contain at least one number", () => {
      const password = generatePassword(20);
      expect(password).toMatch(/[0-9]/);
    });

    it("should contain at least one symbol", () => {
      const password = generatePassword(20);
      expect(password).toMatch(/[!@$^&#$$]/);
    });

    it("should only contain valid characters", () => {
      const password = generatePassword(20);
      const validChars = /^[a-zA-Z0-9!@$^&#$$]+$/;
      expect(password).toMatch(validChars);
    });

    it("should generate different passwords on multiple calls", () => {
      const password1 = generatePassword(20);
      const password2 = generatePassword(20);
      expect(password1).not.toBe(password2);
    });

    it("should meet Auth0 password policy requirements", () => {
      const password = generatePassword(20);
      
      // At least 1 uppercase
      expect(password).toMatch(/[A-Z]/);
      
      // At least 1 lowercase
      expect(password).toMatch(/[a-z]/);
      
      // At least 1 number
      expect(password).toMatch(/[0-9]/);
      
      // At least 1 symbol
      expect(password).toMatch(/[!@$^&#$$]/);
      
      // Minimum length
      expect(password.length).toBeGreaterThanOrEqual(8);
    });

    it("should handle edge case of very short passwords", () => {
      const password = generatePassword(3);
      expect(password).toHaveLength(3);
      // Should still try to include required characters but might not fit all
    });

    it("should handle large password lengths", () => {
      const password = generatePassword(100);
      expect(password).toHaveLength(100);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@$^&#$$]/);
    });

    it("should be properly shuffled (not predictable pattern)", () => {
      const passwords = Array.from({ length: 10 }, () => generatePassword(20));
      
      // Check that not all passwords start with the same character type
      const firstChars = passwords.map(p => p[0]);
      const allUppercase = firstChars.every(char => /[A-Z]/.test(char));
      const allNumbers = firstChars.every(char => /[0-9]/.test(char));
      const allSymbols = firstChars.every(char => /[!@$^&#$$]/.test(char));
      
      expect(allUppercase || allNumbers || allSymbols).toBe(false);
    });
  });
}); 