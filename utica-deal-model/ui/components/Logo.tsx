import React from "react";
import { LOGO_ASPECT, LOGO_MASK_DATA_URI } from "./logoAsset";

/**
 * Brand mark. The client's artwork is embedded as an alpha mask and painted
 * with a theme token, so it reads correctly on the dark rail and follows
 * light/dark mode instead of carrying a baked-in color.
 */
export function Logo({ size = 120 }: { size?: number }) {
  return (
    <div
      className="logo"
      role="img"
      aria-label="Utica, Ohio"
      style={{
        width: size,
        height: Math.round(size / LOGO_ASPECT),
        WebkitMaskImage: `url("${LOGO_MASK_DATA_URI}")`,
        maskImage: `url("${LOGO_MASK_DATA_URI}")`,
      }}
    />
  );
}
