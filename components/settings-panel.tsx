import { ConnectAccountButton } from "@/components/connect-account-button";
import { SignOutButton } from "@/components/sign-out-button";

export function SettingsPanel() {
  return (
    <main className="settings-page" id="settings">
      <header className="settings-heading">
        <p className="settings-eyebrow">Housekeeping</p>
        <h1>Settings</h1>
        <p>Keep your bank connections healthy and manage this Sketch Finance session.</p>
      </header>

      <section className="settings-card settings-connections" aria-labelledby="connections-heading">
        <div className="settings-card-heading">
          <span className="settings-card-mark" aria-hidden="true">⌁</span>
          <div>
            <h2 id="connections-heading">Connected institutions</h2>
            <p>Connect a checking account or credit card, then repair a connection here whenever Plaid asks you to log in again.</p>
          </div>
        </div>
        <ConnectAccountButton />
      </section>

      <section className="settings-card settings-session" aria-labelledby="session-heading">
        <div className="settings-card-heading">
          <span className="settings-card-mark settings-card-mark-coral" aria-hidden="true">↗</span>
          <div>
            <h2 id="session-heading">Session</h2>
            <p>Sign out from this browser when you are finished reviewing your finances.</p>
          </div>
        </div>
        <SignOutButton />
      </section>
    </main>
  );
}
