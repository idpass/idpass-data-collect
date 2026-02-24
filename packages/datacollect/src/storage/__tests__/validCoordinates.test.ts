import { validCoordinates } from "../PostgresEventStorageAdapter";

describe("validCoordinates", () => {
  it("returns coordinates for valid lat/lng", () => {
    expect(validCoordinates({ latitude: -6.2088, longitude: 106.8456 })).toEqual({
      latitude: -6.2088,
      longitude: 106.8456,
    });
  });

  it("returns null for undefined input", () => {
    expect(validCoordinates(undefined)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(validCoordinates(null)).toBeNull();
  });

  it("returns null when latitude is NaN", () => {
    expect(validCoordinates({ latitude: NaN, longitude: 0 })).toBeNull();
  });

  it("returns null when longitude is NaN", () => {
    expect(validCoordinates({ latitude: 0, longitude: NaN })).toBeNull();
  });

  it("returns null when latitude is Infinity", () => {
    expect(validCoordinates({ latitude: Infinity, longitude: 0 })).toBeNull();
  });

  it("returns null when longitude is -Infinity", () => {
    expect(validCoordinates({ latitude: 0, longitude: -Infinity })).toBeNull();
  });

  it("returns null when latitude > 90", () => {
    expect(validCoordinates({ latitude: 90.001, longitude: 0 })).toBeNull();
  });

  it("returns null when latitude < -90", () => {
    expect(validCoordinates({ latitude: -90.001, longitude: 0 })).toBeNull();
  });

  it("returns null when longitude > 180", () => {
    expect(validCoordinates({ latitude: 0, longitude: 180.001 })).toBeNull();
  });

  it("returns null when longitude < -180", () => {
    expect(validCoordinates({ latitude: 0, longitude: -180.001 })).toBeNull();
  });

  it("accepts boundary values: North Pole (90, 0)", () => {
    expect(validCoordinates({ latitude: 90, longitude: 0 })).toEqual({
      latitude: 90,
      longitude: 0,
    });
  });

  it("accepts boundary values: South Pole (-90, 0)", () => {
    expect(validCoordinates({ latitude: -90, longitude: 0 })).toEqual({
      latitude: -90,
      longitude: 0,
    });
  });

  it("accepts boundary values: antimeridian (0, 180)", () => {
    expect(validCoordinates({ latitude: 0, longitude: 180 })).toEqual({
      latitude: 0,
      longitude: 180,
    });
  });

  it("accepts boundary values: antimeridian (0, -180)", () => {
    expect(validCoordinates({ latitude: 0, longitude: -180 })).toEqual({
      latitude: 0,
      longitude: -180,
    });
  });

  it("accepts origin (0, 0)", () => {
    expect(validCoordinates({ latitude: 0, longitude: 0 })).toEqual({
      latitude: 0,
      longitude: 0,
    });
  });
});
