"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { authHeaders } from "@/components/dashboard/auth";

interface AvatarImgProps {
  url: string;
  alt: string;
}

export function AvatarImg({ url, alt }: AvatarImgProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetch(url, { headers: authHeaders() })
      .then((r) => r.blob())
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) {
    return (
      <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700/40 shrink-0 animate-pulse" />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={56}
      height={56}
      unoptimized
      className="w-14 h-14 rounded-xl border border-zinc-200 dark:border-zinc-700/40 shrink-0 object-cover"
    />
  );
}
