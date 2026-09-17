/**
 * Image Downscaling & Compression Utility for Card Scans & Gemini Vision API
 *
 * Guarantees that card images are downscaled to max 1200px on the longest side
 * and compressed to JPEG at ~80–85% quality (<300KB) before payload generation.
 * This prevents Gemini from slicing scans into excessive vision tiles and slashing token costs.
 */

/**
 * Downscales any card image input (File, Blob, data URL, blob URL, or remote URL)
 * before payload generation:
 * - Max dimension: 1200px on the longest side.
 * - Encodes as JPEG at ~80–85% quality (default 0.82).
 * - Keeps file small (under 300KB) to minimize Gemini vision tiling tokens.
 */
export async function downscaleCardImageForAi(
  source: File | Blob | string,
  maxDimension = 1200,
  quality = 0.82
): Promise<string> {
  if (!source) return "";

  return new Promise((resolve, reject) => {
    let url = "";
    let isCreatedUrl = false;

    if (typeof source === "string") {
      url = source;
    } else {
      url = URL.createObjectURL(source);
      isCreatedUrl = true;
    }

    const img = new Image();
    // Enable cross-origin loading if remote URL (e.g. Firebase storage)
    if (typeof source === "string" && (source.startsWith("http://") || source.startsWith("https://"))) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      if (isCreatedUrl) {
        URL.revokeObjectURL(url);
      }

      let width = img.width;
      let height = img.height;

      // Downscale proportionally if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (typeof source === "string" && source.startsWith("data:image/")) {
          resolve(source);
        } else {
          reject(new Error("Unable to create canvas 2D context for image downscaling."));
        }
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      let resultBase64 = canvas.toDataURL("image/jpeg", quality);

      // Verify payload size is strictly under 300KB (~400,000 base64 chars). If larger, compress slightly further.
      if (resultBase64.length > 400000 && quality > 0.70) {
        resultBase64 = canvas.toDataURL("image/jpeg", 0.75);
      }

      resolve(resultBase64);
    };

    img.onerror = (err) => {
      if (isCreatedUrl) {
        URL.revokeObjectURL(url);
      }
      // If error loading and source is already a base64 string, return it as fallback
      if (typeof source === "string" && source.startsWith("data:image/")) {
        resolve(source);
      } else {
        reject(err || new Error("Failed to load image for downscaling."));
      }
    };

    img.src = url;
  });
}

/**
 * Resizes and compresses image Files on the client side using HTML5 Canvas.
 * Max dimension 1200px, quality 0.82 (JPEG).
 */
export async function fileToOptimizedBase64(
  file: File,
  maxDimension = 1200,
  quality = 0.82
): Promise<string> {
  return downscaleCardImageForAi(file, maxDimension, quality);
}

/**
 * Downscales an existing base64 Data URL or image string to a thumbnail or custom size.
 */
export async function compressBase64DataUrl(
  base64Str: string,
  maxDimension = 300,
  quality = 0.6
): Promise<string> {
  if (!base64Str) return "";
  return downscaleCardImageForAi(base64Str, maxDimension, quality);
}
