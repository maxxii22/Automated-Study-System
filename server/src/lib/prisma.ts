import { PrismaClient } from "../../generated/prisma";

declare global {
  // eslint-disable-next-line no-var
  var __studySpherePrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__studySpherePrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__studySpherePrisma__ = prisma;
}
