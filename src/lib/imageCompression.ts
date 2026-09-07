/**
 * Downscales and re-encodes a captured photo before it's ever held as a full
 * base64 string in memory. A raw phone-camera photo (often several MB) turns
 * into an even larger base64 string once encoded -- on a real mobile device
 * that's enough to blow the tab's memory budget, which gets the page
 * silently killed and reloaded by the OS with no JS exception ever firing.
 * OCR of a receipt/label/document doesn't need multi-megapixel resolution,
 * so this trades unnecessary pixels for a payload that's actually safe to
 * hold in memory and send over the network.
 */
export async function downscaleImageToBase64(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<{ base64: string; mimeType: string }> {
  // createImageBitmap's resize options let the browser's native decoder
  // produce an already-downscaled bitmap directly -- it never has to hold
  // the full multi-megapixel decode in memory the way drawing a full-size
  // <img> to canvas does. This is the safer path on a memory-constrained
  // phone; fall back to the <img>-based approach only if unsupported.
  try {
    const bitmap = await createImageBitmap(file, {
      resizeWidth: maxDimension,
      resizeQuality: "medium"
    });
    try {
      return encodeBitmapToBase64(bitmap, quality);
    } finally {
      bitmap.close();
    }
  } catch {
    return downscaleViaImageElement(file, maxDimension, quality);
  }
}

function encodeBitmapToBase64(bitmap: ImageBitmap, quality: number): { base64: string; mimeType: string } {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process that photo.");
  context.drawImage(bitmap, 0, 0);
  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64) throw new Error("Could not process that photo.");
  return { base64, mimeType };
}

function downscaleViaImageElement(file: File, maxDimension: number, quality: number): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!context) {
        reject(new Error("Could not process that photo."));
        return;
      }
      context.drawImage(img, 0, 0, width, height);
      const mimeType = "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) {
        reject(new Error("Could not process that photo."));
        return;
      }
      resolve({ base64, mimeType });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that photo."));
    };
    img.src = objectUrl;
  });
}
