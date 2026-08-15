"use client";

import { useState } from "react";

/**
 * Company avatar: favicon of the company's website when we know it, otherwise
 * a colored initial. The color is derived from the name so every company gets
 * a stable, distinct look without storing anything.
 */
export function CompanyLogo({
  name,
  website,
  size = 18,
}: {
  name: string | null | undefined;
  website?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const label = (name ?? "?").trim() || "?";
  const domain = website
    ? website.replace(/^https?:\/\//, "").split("/")[0]
    : null;

  if (domain && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external favicon service; next/image gains nothing here
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        width={size}
        height={size}
        alt=""
        className="shrink-0 rounded-sm"
        onError={() => setFailed(true)}
      />
    );
  }

  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-sm font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.6,
        backgroundColor: `hsl(${hue} 55% 45%)`,
      }}
    >
      {label[0]!.toUpperCase()}
    </span>
  );
}
