"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

export function ConnectAccountButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkAttemptId, setLinkAttemptId] = useState<string | null>(null);
  const [reconnectItemId, setReconnectItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; institution_name: string | null; status: string }>>([]);

  async function loadConnectedItems() {
    const response = await fetch("/api/plaid/items", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { items?: Array<{ id: string; institution_name: string | null; status: string }> };
    setItems(result.items ?? []);
  }
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken) => {
      if (!publicToken) return;
      setLoading(true);
      setMessage(null);
      const isReconnect = Boolean(reconnectItemId);
      const response = await fetch(isReconnect ? "/api/plaid/reconnect" : "/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isReconnect ? {} : { public_token: publicToken }),
          link_attempt_id: linkAttemptId,
        }),
      });
      const result = await response.json() as { error?: string; connected_accounts?: number; imported_transactions?: number };
      setLoading(false);
      setLinkToken(null);
      setLinkAttemptId(null);
      setReconnectItemId(null);
      setMessage(response.ok
        ? isReconnect
          ? result.imported_transactions === undefined
            ? "Institution reconnected. Transactions will update shortly."
            : "Institution reconnected and transaction sync started."
          : `${result.connected_accounts ?? 0} account(s) connected.`
        : result.error ?? (isReconnect ? "Could not reconnect the institution." : "Could not connect the account."));
      if (response.ok) void loadConnectedItems();
    },
    onExit: () => { setLinkToken(null); setLinkAttemptId(null); setReconnectItemId(null); setLoading(false); },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, open, ready]);

  async function startLink() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/plaid/link-token", { method: "POST" });
    const result = await response.json() as { error?: string; link_token?: string; link_attempt_id?: string };
    if (!response.ok || !result.link_token || !result.link_attempt_id) {
      setLoading(false);
      setMessage(result.error ?? "Could not start the bank connection.");
      return;
    }
    setLinkToken(result.link_token);
    setLinkAttemptId(result.link_attempt_id);
  }

  async function startReconnect(itemId: string) {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/plaid/reconnect-link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    const result = await response.json() as { error?: string; link_token?: string; link_attempt_id?: string };
    if (!response.ok || !result.link_token || !result.link_attempt_id) {
      setLoading(false);
      setMessage(result.error ?? "Could not start the account reconnection.");
      return;
    }
    setReconnectItemId(itemId);
    setLinkToken(result.link_token);
    setLinkAttemptId(result.link_attempt_id);
  }

  async function disconnect(itemId: string) {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/plaid/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    const result = await response.json() as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error ?? "Could not disconnect the institution.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== itemId));
    setMessage("Institution disconnected and its imported transactions removed.");
  }

  return (
    <div className="connect-account-wrap">
      <button className="connect-account-button" type="button" onClick={startLink} disabled={loading || Boolean(linkToken)}>
        {loading ? "Connecting…" : "Connect accounts"}
      </button>
      <button className="connect-account-button" type="button" onClick={() => void loadConnectedItems()} disabled={loading}>
        Manage connected institutions
      </button>
      {message ? <span className="connect-account-message" role="status">{message}</span> : null}
      {items.length > 0 ? (
        <ul aria-label="Connected institutions">
          {items.map((item) => (
            <li key={item.id}>
              {item.institution_name ?? "Connected institution"} ({item.status})
              {item.status === "login_required" ? (
                <button className="reconnect-institution-button" type="button" onClick={() => void startReconnect(item.id)} disabled={loading || Boolean(linkToken)}>Reconnect</button>
              ) : null}
              <button className="disconnect-institution-button" type="button" onClick={() => void disconnect(item.id)} disabled={loading}>Disconnect</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
