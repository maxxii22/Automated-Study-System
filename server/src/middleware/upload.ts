import multer from "multer";

import { env } from "../config/env.js";

function createUpload(options: { fileSize: number; accept: (mimeType: string) => boolean; message: string }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: options.fileSize
    },
    fileFilter: (_request, file, callback) => {
      if (!options.accept(file.mimetype)) {
        callback(new Error(options.message));
        return;
      }

      callback(null, true);
    }
  });
}

export const upload = createUpload({
  fileSize: env.MAX_PDF_UPLOAD_BYTES,
  accept: (mimeType) => mimeType === "application/pdf",
  message: "Only PDF uploads are supported."
});

export const audioUpload = createUpload({
  fileSize: env.MAX_AUDIO_UPLOAD_BYTES,
  accept: (mimeType) => mimeType.startsWith("audio/"),
  message: "Only audio uploads are supported for oral answers."
});
