import type { StudyJobEvent } from "@automated-study-system/shared";

import { createRedisConnection, redis } from "../lib/redis.js";
import { emitStudyJobEvent } from "../lib/socket.js";

const JOB_EVENT_CHANNEL = "study-sphere:job-events";

export async function publishStudyJobEvent(event: StudyJobEvent) {
  await redis.publish(JOB_EVENT_CHANNEL, JSON.stringify(event));
}

export async function startStudyJobEventBridge() {
  const subscriber = createRedisConnection();

  await subscriber.subscribe(JOB_EVENT_CHANNEL);
  subscriber.on("message", (channel, payload) => {
    if (channel !== JOB_EVENT_CHANNEL) {
      return;
    }

    try {
      emitStudyJobEvent(JSON.parse(payload) as StudyJobEvent);
    } catch {
      // Ignore malformed payloads so one bad message does not break the bridge.
    }
  });

  return subscriber;
}
