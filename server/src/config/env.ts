import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:5173,http://localhost:5174"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL."),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required."),
  SUPABASE_ADMIN_USER_IDS: z.string().default(""),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required."),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_TEXT_MODEL: z.string().min(1).optional(),
  GEMINI_MULTIMODAL_MODEL: z.string().min(1).optional(),
  GEMINI_EXAM_MODEL: z.string().min(1).optional(),
  GEMINI_RESCUE_MODEL: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
  GEMINI_EMBEDDING_DIMENSIONALITY: z.coerce.number().int().positive().max(3072).default(768),
  GEMINI_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(2),
  GEMINI_COOLDOWN_MS: z.coerce.number().int().positive().default(60000),
  GEMINI_EXAM_TIMEOUT_MS: z.coerce.number().int().positive().default(9000),
  GEMINI_EMBEDDING_MAX_CHUNKS: z.coerce.number().int().positive().max(8).default(4),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  REDIS_URL: z.string().min(1, "REDIS_URL is required."),
  REDIS_KEY_PREFIX: z.string().min(1).default("study-sphere"),
  STUDY_JOB_QUEUE_NAME: z.string().min(1).default("study-generation"),
  STUDY_JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  STUDY_JOB_CONCURRENCY: z.coerce.number().int().positive().default(2),
  STUDY_JOB_RETENTION_COUNT: z.coerce.number().int().positive().default(1000),
  STUDY_JOB_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(30000),
  STUDY_JOB_STALE_AFTER_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  SEMANTIC_CACHE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SEMANTIC_CACHE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
  SEMANTIC_CACHE_CANDIDATE_LIMIT: z.coerce.number().int().positive().max(100).default(20),
  SEMANTIC_CACHE_MIN_TEXT_LENGTH: z.coerce.number().int().positive().default(1200),
  SEMANTIC_CACHE_MIN_WORD_COUNT: z.coerce.number().int().positive().default(180),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ENDPOINT: z.string().url().optional(),
  ENABLE_LOCAL_OBJECT_STORAGE_FALLBACK: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MAX_PDF_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_AUDIO_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid server environment configuration:\n${formatted}`);
}

export const env = parsedEnv.data;

export function getAllowedClientOrigins() {
  return env.CLIENT_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getSupabaseAdminUserIds() {
  return env.SUPABASE_ADMIN_USER_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
