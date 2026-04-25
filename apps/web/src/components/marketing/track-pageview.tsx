"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function TrackPageview() {
  const pathname = usePathname();

  useEffect(() => {
    const data = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", data);
    } else {
      fetch("/api/track", {
        method: "POST",
        body: data,
        keepalive: true,
      }).catch(() => {
        // Silently fail — never block the page
      });
    }
  }, [pathname]);

  return null;
}
