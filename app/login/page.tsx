import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <Link className="auth-back-link" href="/">← Back to dashboard</Link>
        <p className="auth-eyebrow">Sketch Finance</p>
        <h1 id="login-heading">Welcome back</h1>
        <p className="auth-intro">Sign in to see your accounts, budgets, and transactions.</p>
        <LoginForm />
      </section>
    </main>
  );
}
