import { mkdir, writeFile, unlink, access } from "fs/promises";
import path from "path";
import { constants } from "fs";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
export const AVATAR_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AvatarMime = keyof typeof AVATAR_MIME_TYPES;

export function getUploadDir() {
  const dir = process.env.UPLOAD_DIR?.trim() || "./uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

export function getAvatarsDir() {
  return path.join(getUploadDir(), "avatars");
}

export function isSafeUploadRelativePath(rel: string) {
  if (!rel || rel.includes("\0")) return false;
  const normalized = path.posix.normalize(rel.replace(/\\/g, "/"));
  if (normalized.startsWith("..") || normalized.includes("/../") || path.isAbsolute(normalized)) {
    return false;
  }
  return true;
}

export function resolveUploadPath(rel: string) {
  if (!isSafeUploadRelativePath(rel)) return null;
  const root = getUploadDir();
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) {
    return null;
  }
  return full;
}

export async function ensureAvatarsDir() {
  const dir = getAvatarsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function avatarPublicUrl(userId: string, ext: string) {
  return `/api/uploads/avatars/${userId}.${ext}`;
}

export async function saveAvatarFile(userId: string, buffer: Buffer, mime: AvatarMime) {
  const ext = AVATAR_MIME_TYPES[mime];
  const dir = await ensureAvatarsDir();

  // Remove previous avatar variants for this user
  for (const other of Object.values(AVATAR_MIME_TYPES)) {
    const prev = path.join(dir, `${userId}.${other}`);
    try {
      await access(prev, constants.F_OK);
      await unlink(prev);
    } catch {
      /* missing is fine */
    }
  }

  const filePath = path.join(dir, `${userId}.${ext}`);
  await writeFile(filePath, buffer);
  return { filePath, url: avatarPublicUrl(userId, ext), ext };
}

export function detectAvatarMime(file: File): AvatarMime | null {
  if (file.type in AVATAR_MIME_TYPES) {
    return file.type as AvatarMime;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}
