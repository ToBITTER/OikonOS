import "dotenv/config";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    RESEND_API_KEY: z.string().startsWith("re_").optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3),
    EMAIL_REPLY_TO: z.string().email().optional(),
    APP_URL: z.string().url().default("http://localhost:5173"),
  })
  .superRefine((value, ctx) => {
    if (
      !value.RESEND_API_KEY &&
      !(value.SMTP_HOST && value.SMTP_USER && value.SMTP_PASSWORD)
    )
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Set RESEND_API_KEY or complete SMTP credentials.",
      });
  });
export type Config = z.infer<typeof schema>;
let value: Config | undefined;
export function config() {
  if (!value) {
    const result = schema.safeParse(process.env);
    if (!result.success)
      throw new Error(
        `Invalid runtime configuration: ${result.error.issues.map((x) => x.path.join(".") + ": " + x.message).join("; ")}`,
      );
    value = result.data;
  }
  return value;
}
