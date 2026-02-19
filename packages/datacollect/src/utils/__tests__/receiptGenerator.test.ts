/**
 * @jest-environment jsdom
 */
import "core-js/stable/structured-clone";

import {
  generateOfflineReceiptNumber,
  generateServerReceiptNumber,
} from "../receiptGenerator";

describe("generateOfflineReceiptNumber", () => {
  test("produces correct format: RCP-{YYYYMMDD}-{8-char-uppercase-deviceId}-{4-digit-seq}", () => {
    const receipt = generateOfflineReceiptNumber("abcdefghijklmnop", 1);
    // Format: RCP-YYYYMMDD-ABCDEFGH-0001
    expect(receipt).toMatch(/^RCP-\d{8}-[A-Z0-9]{8}-\d{4}$/);
  });

  test("uses today's date in YYYYMMDD format", () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const receipt = generateOfflineReceiptNumber("device123", 1);
    expect(receipt).toContain(`RCP-${today}-`);
  });

  test("truncates deviceId to first 8 characters and uppercases", () => {
    const receipt = generateOfflineReceiptNumber("abcdefghijklmnop", 1);
    const parts = receipt.split("-");
    // RCP-YYYYMMDD-ABCDEFGH-0001
    expect(parts[2]).toBe("ABCDEFGH");
  });

  test("pads sequence to 4 digits", () => {
    const receipt1 = generateOfflineReceiptNumber("device123", 1);
    const receipt42 = generateOfflineReceiptNumber("device123", 42);
    const receipt999 = generateOfflineReceiptNumber("device123", 999);
    const receipt1000 = generateOfflineReceiptNumber("device123", 1000);

    expect(receipt1.endsWith("-0001")).toBe(true);
    expect(receipt42.endsWith("-0042")).toBe(true);
    expect(receipt999.endsWith("-0999")).toBe(true);
    expect(receipt1000.endsWith("-1000")).toBe(true);
  });

  test("uppercases short deviceId", () => {
    const receipt = generateOfflineReceiptNumber("dev1", 5);
    const parts = receipt.split("-");
    expect(parts[2]).toBe("DEV1");
  });

  test("different sequences produce different receipt numbers", () => {
    const receipt1 = generateOfflineReceiptNumber("device123", 1);
    const receipt2 = generateOfflineReceiptNumber("device123", 2);
    expect(receipt1).not.toBe(receipt2);
  });
});

describe("generateServerReceiptNumber", () => {
  test("produces correct format using 'S' as source", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const receipt = generateServerReceiptNumber(date, 1);
    expect(receipt).toBe("RCP-20240615-S-000001");
  });

  test("pads sequence to 6 digits", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    expect(generateServerReceiptNumber(date, 1)).toBe("RCP-20240615-S-000001");
    expect(generateServerReceiptNumber(date, 42)).toBe("RCP-20240615-S-000042");
    expect(generateServerReceiptNumber(date, 999999)).toBe("RCP-20240615-S-999999");
  });

  test("uses the provided date for YYYYMMDD portion", () => {
    const date = new Date("2025-12-25T00:00:00Z");
    const receipt = generateServerReceiptNumber(date, 1);
    expect(receipt).toContain("RCP-20251225-S-");
  });

  test("different dates produce different receipt numbers for same sequence", () => {
    const date1 = new Date("2024-06-15T00:00:00Z");
    const date2 = new Date("2024-06-16T00:00:00Z");
    const receipt1 = generateServerReceiptNumber(date1, 1);
    const receipt2 = generateServerReceiptNumber(date2, 1);
    expect(receipt1).not.toBe(receipt2);
  });
});

// ===========================================================================
// Bug 4: Date portion uses UTC — documenting known behavior
// ===========================================================================

describe("generateOfflineReceiptNumber – UTC date behavior", () => {
  test("date portion comes from UTC via toISOString, not local time", () => {
    // toISOString() always returns UTC. If the device is in UTC+5 at 11 PM
    // local time, UTC would already be the next calendar day.
    // We verify this by mocking Date to return a specific timestamp and
    // confirming the receipt uses the UTC date representation.

    // 2024-06-15T23:00:00+05:00 => 2024-06-15T18:00:00Z (same UTC day)
    // 2024-06-16T02:00:00+05:00 => 2024-06-15T21:00:00Z (still June 15 in UTC)
    // 2024-06-16T05:00:00+05:00 => 2024-06-16T00:00:00Z (now June 16 in UTC)

    // Simulate a moment where local date might differ from UTC date:
    // At UTC midnight of June 16, the receipt should show 20240616,
    // even if the local timezone is still June 15.
    const realDate = Date;
    const mockDate = new realDate("2024-06-16T00:00:00Z"); // midnight UTC = June 16
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DateSpy = jest.spyOn(global, "Date").mockImplementation((...args: any[]) => {
      if (args.length === 0) {
        return mockDate;
      }
      return new realDate(...(args as [string]));
    }) as unknown;

    const receipt = generateOfflineReceiptNumber("device01", 1);
    expect(receipt).toContain("RCP-20240616-");

    (DateSpy as jest.SpyInstance).mockRestore();
  });
});

