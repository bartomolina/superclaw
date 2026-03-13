"use client";

import { AppToaster } from "@/components/ui/app-toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}
