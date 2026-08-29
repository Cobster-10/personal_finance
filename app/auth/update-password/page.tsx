import { UpdatePasswordForm } from "@/components/update-password-form";

export default function UpdatePasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="password-heading">
        <p className="auth-eyebrow">Sketch Finance</p>
        <h1 id="password-heading">Choose a new password</h1>
        <p className="auth-intro">Use at least 8 characters to secure your account.</p>
        <UpdatePasswordForm />
      </section>
    </main>
  );
}
