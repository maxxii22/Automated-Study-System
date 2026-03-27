import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "../config/env.js";

type StoredObject = {
  objectKey: string;
  mimeType: string;
  size: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../data/uploads");

function createS3Client() {
  if (!env.S3_BUCKET) {
    return null;
  }

  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE
  });
}

const s3Client = createS3Client();

function assertLocalFallbackEnabled() {
  if (!env.ENABLE_LOCAL_OBJECT_STORAGE_FALLBACK) {
    throw new Error("Local object storage fallback is disabled. Configure S3-compatible storage for this environment.");
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function storeSourceDocument(payload: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<StoredObject> {
  const extension = path.extname(payload.fileName) || ".bin";
  const objectKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;

  if (s3Client && env.S3_BUCKET) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Body: payload.buffer,
        ContentType: payload.mimeType
      })
    );

    return {
      objectKey,
      mimeType: payload.mimeType,
      size: payload.buffer.byteLength
    };
  }

  assertLocalFallbackEnabled();
  const destinationPath = path.join(uploadsRoot, objectKey);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, payload.buffer);

  return {
    objectKey,
    mimeType: payload.mimeType,
    size: payload.buffer.byteLength
  };
}

export async function readSourceDocument(objectKey: string): Promise<Buffer> {
  if (s3Client && env.S3_BUCKET) {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey
      })
    );

    if (!response.Body) {
      throw new Error("Stored PDF could not be downloaded.");
    }

    return streamToBuffer(response.Body as NodeJS.ReadableStream);
  }

  assertLocalFallbackEnabled();
  return readFile(path.join(uploadsRoot, objectKey));
}
