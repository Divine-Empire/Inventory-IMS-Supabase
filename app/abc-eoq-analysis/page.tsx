import { MainLayout } from "@/components/layout/main-layout";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function AbcEoqAnalysisPage() {
  return (
    <MainLayout>
      <ComingSoon
        title="ABC / EOQ Analysis"
        description="Revenue-based A/B/C classification and Economic Order Quantity per item — waiting on the LTO/OTP sales sync job."
      />
    </MainLayout>
  );
}
