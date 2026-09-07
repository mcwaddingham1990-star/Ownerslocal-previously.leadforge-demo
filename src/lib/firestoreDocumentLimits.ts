// Firestore caps a single document at ~1 MiB (1,048,576 bytes) including
// field-name overhead. A base64 payload embedded directly on a document
// record -- a generated PDF, a scanned photo -- must stay safely under that
// or the write throws and gets silently dropped by the sync layer (each
// write path only console.error's a failed setDoc, so the record just never
// shows up). Same ceiling already used for scanned Snapshot photos, see
// SNAPSHOT_PHOTO_MAX_BASE64_LENGTH in scanSnapshotDocument.ts.
export const MAX_INLINE_BASE64_LENGTH = 900_000;
