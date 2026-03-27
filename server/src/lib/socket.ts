import type { Server as HttpServer } from "node:http";

import { Server } from "socket.io";

import type { StudyJobEvent } from "@automated-study-system/shared";
import { verifyAccessToken } from "../services/authService.js";
import { findStudyJob } from "../services/studyJobRepository.js";

let io: Server | null = null;

export function createSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;

    if (!token) {
      next(new Error("Authentication is required."));
      return;
    }

    const user = await verifyAccessToken(token);

    if (!user) {
      next(new Error("Authentication failed."));
      return;
    }

    socket.data.userId = user.id;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("study-job:subscribe", async (jobId: string) => {
      if (typeof jobId === "string" && jobId.trim()) {
        const job = await findStudyJob(String(socket.data.userId), jobId);

        if (job) {
          socket.join(getJobRoom(jobId));
        }
      }
    });

    socket.on("study-job:unsubscribe", (jobId: string) => {
      if (typeof jobId === "string" && jobId.trim()) {
        socket.leave(getJobRoom(jobId));
      }
    });
  });

  return io;
}

export function emitStudyJobEvent(event: StudyJobEvent) {
  io?.to(getJobRoom(event.jobId)).emit(event.type, event);
}

function getJobRoom(jobId: string) {
  return `study-job:${jobId}`;
}
