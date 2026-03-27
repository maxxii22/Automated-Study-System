import type { AuthenticatedUser } from "../services/authService.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
