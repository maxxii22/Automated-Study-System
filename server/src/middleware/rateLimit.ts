import rateLimit from "express-rate-limit";

export const generateStudySetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many study generation requests. Please wait a few minutes and try again."
  }
});
