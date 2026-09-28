import { MainLayout } from "@/components/layout/main-layout";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function ReportsPage() {
  return (
    <MainLayout>
      <ComingSoon title="Reports" description="Exportable stock ledger, valuation and movement reports — next batch." />
    </MainLayout>
  );
}
