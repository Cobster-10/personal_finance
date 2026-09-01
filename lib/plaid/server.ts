import "server-only";

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let plaidClient: PlaidApi | undefined;

export function getPlaidClient() {
  if (plaidClient) return plaidClient;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const environment = process.env.PLAID_ENV ?? "sandbox";
  const basePath = PlaidEnvironments[environment as keyof typeof PlaidEnvironments];

  if (!clientId || !secret || !basePath) {
    throw new Error("Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV.");
  }

  plaidClient = new PlaidApi(new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  }));

  return plaidClient;
}

export function plaidErrorMessage(error: unknown) {
  const responseData = (error as { response?: { data?: { error_message?: string } } })?.response?.data;
  return responseData?.error_message ?? (error instanceof Error ? error.message : "Plaid could not complete the request.");
}
