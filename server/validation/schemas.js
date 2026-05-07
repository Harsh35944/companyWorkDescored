import { z } from "zod";

/** Discord snowflake id */
export const guildIdParamSchema = z.object({
  guildId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, "Invalid guild id"),
});

export const guildIdAndIdParamSchema = guildIdParamSchema.extend({
  id: z.string().trim().min(1),
});

export const analyticsQuerySchema = z.object({
  period: z.enum(["24h", "7d", "30d"]).optional().default("24h"),
  metric: z.enum(["characters", "messages"]).optional().default("characters"),
});

const nonNegInt = z.coerce
  .number()
  .refine((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0, {
    message: "Must be a non-negative integer",
  })
  .refine((n) => n <= 1_000_000_000_000, {
    message: "Value too large",
  });

export const statsBodySchema = z
  .object({
    translatedCharacters: nonNegInt.optional().default(0),
    translatedMessages: nonNegInt.optional().default(0),
  })
  .strict();

export const botInviteBodySchema = z.object({
  guildId: z
    .string()
    .trim()
    .min(1, "guildId required")
    .regex(/^\d{17,20}$/, "Invalid guild id"),
});

const snowflake = z.string().trim().regex(/^(\d{17,20}|all)$/, "Invalid discord id");
const style = z.enum(["TEXT", "EMBED", "WEBHOOK"]);

export const guildFeaturesPatchSchema = z
  .object({
    plan: z.enum(["free", "premium", "pro"]).optional(),
    maxCharactersPerDay: nonNegInt.optional(),
    autoEraseMode: z.enum(["ONLY_FROM_ORIGINAL", "ONLY_FROM_TRANSLATED", "ALL"]).optional(),
    defaultStyle: style.optional(),
    features: z
      .object({
        translationByFlagEnabled: z.boolean().optional(),
        autoTranslateEnabled: z.boolean().optional(),
        roleTranslateEnabled: z.boolean().optional(),
        userTranslateEnabled: z.boolean().optional(),
        autoEraseEnabled: z.boolean().optional(),
        autoReactEnabled: z.boolean().optional(),
        ttsEnabled: z.boolean().optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

export const autoTranslateConfigCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    sourceType: z.enum(["CHANNEL", "CATEGORY"]).default("CHANNEL"),
    sourceId: snowflake,
    sourceLanguage: z.string().trim().min(2).max(12).optional(),
    style: style.default("TEXT"),
    enabled: z.boolean().default(true),
    targets: z
      .array(
        z.object({
          targetType: z.enum(["CHANNEL", "THREAD"]).default("CHANNEL"),
          targetId: snowflake,
          targetLanguage: z.string().trim().min(2).max(12),
        }),
      )
      .min(1),
  })
  .strict();

export const autoTranslateConfigPatchSchema = autoTranslateConfigCreateSchema
  .partial()
  .strict();

export const roleTranslateConfigCreateSchema = z
  .object({
    roleId: snowflake,
    targetLanguage: z.string().trim().min(2).max(12),
    style: style.default("TEXT"),
    enabled: z.boolean().default(true),
  })
  .strict();

export const roleTranslateConfigPatchSchema = roleTranslateConfigCreateSchema
  .partial()
  .strict();

export const flagReactionConfigPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    style: style.optional(),
    sendInPm: z.boolean().optional(),
    sendInThread: z.boolean().optional(),
    autoDisappearSeconds: nonNegInt.optional(),
  })
  .strict();

export const textReplacementCreateSchema = z
  .object({
    input: z.string().trim().min(1).max(200),
    output: z.string().trim().min(1).max(200),
  })
  .strict();

export const translateBanPatchSchema = z
  .object({
    userIds: z.array(snowflake).optional(),
    roleIds: z.array(snowflake).optional(),
  })
  .strict();

export const userTranslateConfigCreateSchema = z
  .object({
    userId: snowflake,
    targetLanguage: z.string().trim().min(2).max(12),
    style: style.default("TEXT"),
    enabled: z.boolean().default(true),
  })
  .strict();

export const userTranslateConfigPatchSchema = userTranslateConfigCreateSchema
  .partial()
  .strict();
