import { FinanceDashboard } from "@/components/finance-dashboard";
import { getDashboardData } from "@/lib/finance/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const dashboardData = await getDashboardData(month);

  return <FinanceDashboard initialData={dashboardData} />;
}
