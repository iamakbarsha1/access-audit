import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
  }

  // Use Vercel Blob in production, local filesystem in development
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`logos/${session.user.id}-${Date.now()}`, file, {
      access: "public",
    });
    return NextResponse.json({ url: blob.url });
  }

  // Local dev: save to public/uploads/
  const ext = file.name.split(".").pop() || "png";
  const filename = `${session.user.id}-${Date.now()}.${ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadDir, filename), buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
