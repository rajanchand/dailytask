/** Whether open self-registration is enabled (default: invite-only). */
export function isPublicRegisterAllowed() {
  const raw = process.env.ALLOW_PUBLIC_REGISTER;
  if (raw === undefined || raw === "") return false;
  return raw === "true" || raw === "1";
}
