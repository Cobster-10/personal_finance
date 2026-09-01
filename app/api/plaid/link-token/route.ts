import { NextResponse } from "next/server";
import { CountryCode, CreditAccountSubtype, DepositoryAccountSubtype, Products, type LinkTokenCreateRequest } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { getPlaidClient, plaidErrorMessage } from "@/lib/plaid/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const request: LinkTokenCreateRequest = {
    client_name: "Sketch Finance",
    language: "en",
    country_codes: [CountryCode.Us],
    products: [Products.Transactions],
    user: { client_user_id: user.id },
    account_filters: {
      depository: { account_subtypes: [DepositoryAccountSubtype.Checking] },
      credit: { account_subtypes: [CreditAccountSubtype.CreditCard] },
    },
  };

  const customizationName = process.env.PLAID_LINK_CUSTOMIZATION_NAME;
  if (customizationName) request.link_customization_name = customizationName;

  const webhookUrl = process.env.PLAID_WEBHOOK_URL;
  if (webhookUrl) request.webhook = webhookUrl;

  try {
    const { data } = await getPlaidClient().linkTokenCreate(request);
    return NextResponse.json({ link_token: data.link_token });
  } catch (error) {
    return NextResponse.json({ error: plaidErrorMessage(error) }, { status: 502 });
  }
}
