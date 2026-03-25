import multer from "multer";

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
  fileSize: 10 * 1024 * 1024,
  accept: (mimeType) => mimeType === "application/pdf",
  message: "Only PDF uploads are supported."
});

export const audioUpload = createUpload({
  fileSize: 15 * 1024 * 1024,
  accept: (mimeType) => mimeType.startsWith("audio/"),
  message: "Only audio uploads are supported for oral answers."
});
