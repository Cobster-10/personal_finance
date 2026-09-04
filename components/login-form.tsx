"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(nextPath?: string) {
  return nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
}

export function LoginForm({ nextPath, initialMessage }: { nextPath?: string; initialMessage?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signupsAllowed = process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "true";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

    if (result.error) {
      setMessage(result.error.message);
      setIsSubmitting(false);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      setMode("login");
      setIsSubmitting(false);
      return;
    }

    router.push(safeNextPath(nextPath));
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />

      <label htmlFor="password">Password</label>
      <input
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        id="password"
        minLength={8}
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />

      <button className="auth-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      {signupsAllowed ? (
        <button
          className="auth-mode-toggle"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage(null);
          }}
          type="button"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      ) : null}

      {mode === "login" ? (
        <button
          className="auth-mode-toggle"
          onClick={async () => {
            setMessage(null);
            if (!email) {
              setMessage("Enter your email address first, then request a reset link.");
              return;
            }
            setIsSubmitting(true);
            const { error } = await createClient().auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
            });
            setMessage(error ? error.message : "Check your email for a password reset link.");
            setIsSubmitting(false);
          }}
          type="button"
        >
          Forgot password?
        </button>
      ) : null}

      {message ? <p className="auth-message" role="status">{message}</p> : null}
    </form>
  );
}
