export const TUS_CHUNK_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_TUS_UPLOAD_BYTES = 30 * 1024 * 1024 * 1024;

export function uploadFingerprint(input: { filmId: string; kind: string; file: Pick<File, "name" | "size" | "lastModified"> }) {
  return ["ney-media-core-tus", input.filmId, input.kind, input.file.name, input.file.size, input.file.lastModified].join(":");
}

export function isValidTusOffset(offset: number, fileSize: number) {
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= fileSize;
}
