import { promises as fs } from "fs";
import path from "path";
import { imageNameFromPhoto } from "@/lib/backup";
import { IMAGES_DIR } from "@/lib/inventory-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// `next start` only serves files that were in public/ when the server booted,
// so photos uploaded or restored afterwards fall through to this handler.
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = imageNameFromPhoto(`/images/${(await params).name}`);
  if (!name) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await fs.readFile(path.join(IMAGES_DIR, name));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
