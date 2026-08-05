import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { rateLimitAction } from "@/server/security/rate-limit";
import {
  AVATAR_MAX_BYTES,
  detectAvatarMime,
  saveAvatarFile,
} from "@/server/uploads";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimitAction("avatar-upload", 8, 60 * 15, session.user.id);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Avatar file is required" }, { status: 400 });
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 2MB or smaller" }, { status: 400 });
  }

  const mime = detectAvatarMime(file);
  if (!mime) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images are allowed" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveAvatarFile(session.user.id, buffer, mime);

  await db
    .update(users)
    .set({ image: saved.url, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true, image: saved.url });
}
