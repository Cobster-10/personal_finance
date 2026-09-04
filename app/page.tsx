import { FinanceDashboard } from "@/components/finance-dashboard";
import { getDashboardData } from "@/lib/finance/dashboard-data";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { month, tab } = await searchParams;
  const dashboardData = await getDashboardData(month);
  const initialTab = tab === "categories" ? "Categories" as const : "Snapshot" as const;

  return <FinanceDashboard key={`${dashboardData.month}-${initialTab}`} initialData={dashboardData} initialTab={initialTab} />;
}
