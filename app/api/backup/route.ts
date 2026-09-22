import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createBackupZip, restoreBackupZip } from "@/lib/backup-store";
import { BackupError } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const zip = await createBackupZip();
    const filename = `stuff-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not create a backup." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that upload." }, { status: 400 });
  }

  const file = form.get("backup");
  if (!isUpload(file) || file.size === 0) {
    return NextResponse.json({ error: "Choose a backup zip file." }, { status: 400 });
  }

  try {
    const result = await restoreBackupZip(new Uint8Array(await file.arrayBuffer()));
    revalidatePath("/");
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof BackupError ? error.message : "Could not restore that backup.";
    const status = error instanceof BackupError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return (
    !!value &&
    typeof value === "object" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "size" in value &&
    typeof value.size === "number"
  );
}
