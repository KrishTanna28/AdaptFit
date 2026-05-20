import { z } from "zod";

export const DateKeySchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
export const NonEmptyStringSchema = z.string().trim().min(1);
export const OptionalNonEmptyStringSchema = (maxLength = 500) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    },
    z.string().min(1).max(maxLength).optional(),
  );

export const NullableStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    return typeof value === "string" ? value.trim() : String(value);
  },
  z.string().nullable(),
);

export const CoercedFiniteNumberSchema = z.coerce.number().finite();
export const NonNegativeNumberSchema = CoercedFiniteNumberSchema.min(0);
export const NonNegativeIntSchema = z.coerce.number().int().min(0);
export const PositiveIntSchema = z.coerce.number().int().positive();
export const RatioSchema = CoercedFiniteNumberSchema.min(0).max(1);

export const NullableNumberSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    return value;
  },
  CoercedFiniteNumberSchema.nullable(),
);

export const SerializableValueSchema = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SerializableValueSchema),
    z.record(z.string(), SerializableValueSchema),
  ]),
);

export const SerializableRecordSchema = z.record(z.string(), SerializableValueSchema);

