import rateLimit from "express-rate-limit";

function createLimiter(max: number, message: string) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message
    }
  });
}

export const generateStudySetRateLimit = createLimiter(
  12,
  "Too many study generation requests. Please wait a few minutes and try again."
);

export const pdfStudyJobRateLimit = createLimiter(
  10,
  "Too many PDF uploads were queued from this IP. Please wait a few minutes and try again."
);

export const examRateLimit = createLimiter(
  40,
  "Too many exam or transcription requests. Please slow down and try again."
);
