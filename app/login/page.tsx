import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string }>;
}) {
  const supabase = await createClient();
  const [{ data: { user } }, params] = await Promise.all([
    supabase.auth.getUser(),
    searchParams,
  ]);

  if (user) {
    redirect("/");
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="auth-eyebrow">Sketch Finance</p>
        <h1 id="login-heading">Welcome back</h1>
        <p className="auth-intro">Sign in to see your accounts, budgets, and transactions.</p>
        <LoginForm nextPath={params.next} initialMessage={params.message} />
      </section>
    </main>
  );
}
