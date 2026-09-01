"use client";

import type { ReactNode } from "react";
import type { PluginIconId } from "@/lib/plugin-catalog";

export function PluginIcon({
  name,
  size = 20,
}: {
  name: PluginIconId;
  size?: number;
}) {
  const wrap = (bg: string, inner: ReactNode) => (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[5px]"
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      {inner}
    </span>
  );

  if (name === "documents") {
    return wrap(
      "#4285F4",
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 16 16" fill="none">
        <path d="M4 2.5h5.2L12 5.3V13.5H4V2.5Z" fill="white" fillOpacity="0.95" />
        <path d="M9.2 2.5V5.3H12" fill="#C5DBFF" />
        <path d="M5.4 7.2h5.2M5.4 9h5.2M5.4 10.8h3.4" stroke="#4285F4" strokeWidth="1" strokeLinecap="round" />
      </svg>,
    );
  }

  if (name === "presentations") {
    return wrap(
      "#F4B400",
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 16 16" fill="none">
        <rect x="2.2" y="3.4" width="11.6" height="8" rx="1.1" fill="white" />
        <rect x="3.4" y="4.8" width="4.2" height="2.6" rx="0.4" fill="#F4B400" />
        <path d="M8.6 5.4h4M8.6 7.2h4M3.4 9.2h9.2M3.4 10.6h6" stroke="#F4B400" strokeWidth="0.9" strokeLinecap="round" />
      </svg>,
    );
  }

  if (name === "pdf") {
    return wrap(
      "#E53935",
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 16 16" fill="none">
        <text
          x="8"
          y="11.2"
          textAnchor="middle"
          fill="white"
          fontSize="6.2"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          PDF
        </text>
      </svg>,
    );
  }

  if (name === "spreadsheets") {
    return wrap(
      "#0F9D58",
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 16 16" fill="none">
        <rect x="2.4" y="2.8" width="11.2" height="10.4" rx="1" fill="white" />
        <path d="M2.4 6.2h11.2M2.4 9.6h11.2M6.2 2.8v10.4M9.8 2.8v10.4" stroke="#0F9D58" strokeWidth="0.9" />
      </svg>,
    );
  }

  if (name === "search") {
    return wrap(
      "#1A73E8",
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.1" stroke="white" strokeWidth="1.3" />
        <path d="M8 3.4c1.4 1.2 2.2 2.8 2.2 4.6S9.4 11.4 8 12.6C6.6 11.4 5.8 9.8 5.8 8S6.6 4.6 8 3.4Z" stroke="white" strokeWidth="1.1" />
        <path d="M3.2 8h9.6" stroke="white" strokeWidth="1.1" />
      </svg>,
    );
  }

  return wrap(
    "#4FC3F7",
    <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.4" width="12" height="9.2" rx="1.4" fill="white" fillOpacity="0.2" />
      <path d="M3 11.4 6.2 7.6l2.2 2.3 1.7-1.8 3 3.3H3Z" fill="white" />
      <circle cx="10.6" cy="6.1" r="1.15" fill="#FFE082" />
    </svg>,
  );
}
