import { after, NextResponse } from "next/server";
import { MAX_UPDATE_BYTES, UpdateError, applyUpdateArchive, restartInstalledApp } from "@/lib/update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let updating = false;

export async function POST(request: Request) {
  if (updating) {
    return NextResponse.json({ error: "An update is already running." }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that upload." }, { status: 400 });
  }

  const file = form.get("update");
  if (!isUpload(file) || file.size === 0) {
    return NextResponse.json({ error: "Choose a Stuff update zip." }, { status: 400 });
  }
  if (file.size > MAX_UPDATE_BYTES) {
    return NextResponse.json({ error: "That update is too large." }, { status: 400 });
  }

  updating = true;
  try {
    const cwd = process.cwd();
    const result = await applyUpdateArchive(new Uint8Array(await file.arrayBuffer()), cwd);
    after(() => {
      void restartInstalledApp(cwd).catch((error: unknown) => {
        console.error(error);
      });
    });
    return NextResponse.json({
      ok: true,
      version: result.version,
      message: "Update installed. Stuff is restarting. Your bins and photos were kept.",
    });
  } catch (error) {
    const message = error instanceof UpdateError ? error.message : "Could not install that update.";
    const status = error instanceof UpdateError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  } finally {
    updating = false;
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
