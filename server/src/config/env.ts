import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required."),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid server environment configuration:\n${formatted}`);
}

export const env = parsedEnv.data;
