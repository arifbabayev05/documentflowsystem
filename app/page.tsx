"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function RootPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Only trigger redirect when initialization is complete
    if (!isLoading) {
      if (user) {
        console.log("RootPage: User found, redirecting to dashboard");
        router.replace("/dashboard");
      } else {
        console.log("RootPage: No user, redirecting to login");
        router.replace("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-main">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
        <p className="text-sm font-black text-text-soft uppercase tracking-widest">Yüklənir...</p>
      </div>
    </div>
  );
}
