"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { logoutAction } from "@/server/actions/auth";
import { lockSystemHealthAction } from "@/server/actions/system-health-gate";

/** Idle timeout: 3 minutes. */
export const APP_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "pointerdown",
  "wheel",
] as const;

type IdleTimeoutGuardProps = {
  isSuperAdmin?: boolean;
};

/**
 * - `/system-health*`: first 3 min idle → lock System Health only (other menus still work).
 *   Second 3 min idle on that portal → full logout.
 * - All other pages: 3 min idle → full session logout.
 */
export function IdleTimeoutGuard({ isSuperAdmin = false }: IdleTimeoutGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const handlingRef = useRef(false);
  /** After System Health was idle-locked once this visit, next idle signs out fully. */
  const systemHealthIdleLockedRef = useRef(false);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    handlingRef.current = false;
    if (!pathname.startsWith("/system-health")) {
      systemHealthIdleLockedRef.current = false;
    }

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const signOutFully = async () => {
      try {
        toast.message("Signed out after 3 minutes of inactivity");
        await logoutAction();
      } catch {
        window.location.href = "/login";
      }
    };

    const onIdle = async () => {
      if (handlingRef.current) return;
      handlingRef.current = true;

      const onSystemHealth = pathname.startsWith("/system-health");

      if (onSystemHealth && isSuperAdmin && !systemHealthIdleLockedRef.current) {
        try {
          await lockSystemHealthAction();
          systemHealthIdleLockedRef.current = true;
          toast.message("System Health locked after 3 minutes of inactivity");
          router.replace("/system-health");
          router.refresh();
        } catch {
          systemHealthIdleLockedRef.current = true;
        } finally {
          lastActivityRef.current = Date.now();
          handlingRef.current = false;
        }
        return;
      }

      await signOutFully();
    };

    const tick = () => {
      if (handlingRef.current) return;
      if (Date.now() - lastActivityRef.current >= APP_IDLE_TIMEOUT_MS) {
        void onIdle();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true });
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") markActivity();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onSystemHealthUnlocked = () => {
      systemHealthIdleLockedRef.current = false;
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("system-health-unlocked", onSystemHealthUnlocked);

    const intervalId = window.setInterval(tick, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("system-health-unlocked", onSystemHealthUnlocked);
      window.clearInterval(intervalId);
    };
  }, [pathname, router, isSuperAdmin]);

  return null;
}
