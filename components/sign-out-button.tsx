"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <button
      className="sign-out-button"
      disabled={isSigningOut}
      onClick={async () => {
        setIsSigningOut(true);
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      type="button"
    >
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
