"use client";

import { useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";

export function ConnectAccountButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (async (publicToken, metadata) => {
      if (!publicToken) return;
      setLoading(true);
      setMessage(null);
      const response = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
        }),
      });
      const result = await response.json() as { error?: string; connected_accounts?: number };
      setLoading(false);
      setLinkToken(null);
      setMessage(response.ok ? `${result.connected_accounts ?? 0} account(s) connected.` : result.error ?? "Could not connect the account.");
    }) satisfies PlaidLinkOnSuccess,
    onExit: () => { setLinkToken(null); setLoading(false); },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, open, ready]);

  async function startLink() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/plaid/link-token", { method: "POST" });
    const result = await response.json() as { error?: string; link_token?: string };
    if (!response.ok || !result.link_token) {
      setLoading(false);
      setMessage(result.error ?? "Could not start the bank connection.");
      return;
    }
    setLinkToken(result.link_token);
  }

  return (
    <div className="connect-account-wrap">
      <button className="connect-account-button" type="button" onClick={startLink} disabled={loading || Boolean(linkToken)}>
        {loading ? "Connecting…" : "Connect accounts"}
      </button>
      {message ? <span className="connect-account-message" role="status">{message}</span> : null}
    </div>
  );
}
