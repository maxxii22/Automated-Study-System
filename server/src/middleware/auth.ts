import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../services/authService.js";

function extractBearerToken(request: Request) {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return response.status(401).json({
      message: "Authentication is required."
    });
  }

  const user = await verifyAccessToken(accessToken);

  if (!user) {
    return response.status(401).json({
      message: "Your session is invalid or expired. Please sign in again."
    });
  }

  request.authUser = user;
  next();
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (!request.authUser) {
    return response.status(401).json({
      message: "Authentication is required."
    });
  }

  if (!request.authUser.isAdmin) {
    return response.status(403).json({
      message: "Administrator access is required."
    });
  }

  next();
}
