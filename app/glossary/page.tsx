"use client";

import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { FilterToolbar } from "@/components/data/filter-toolbar";
import { EmptyState } from "@/components/data/table-states";
import { Button } from "@/components/ui/button";

type Term = { term: string; meaning: string };
type Group = { title: string; terms: Term[] };

const GROUPS: Group[] = [
  {
    title: "Inventory Page - Columns",
    terms: [
      { term: "Live Stock", meaning: "Kitna actual stock abhi us location pe hai - IN/OUT/Transfer sab ledger entries ka running total." },
      { term: "Reserved", meaning: "OTP ke Packing List me jo stock kisi order ke liye alag rakha ja chuka hai lekin Pre-Invoice se abhi dispatch (OUT) nahi hua - Live Stock me count hota hai, par naye order ya transfer ke liye available nahi." },
      { term: "Free", meaning: "Live Stock - Reserved. Matlab abhi jitna naye order ko promise ya kisi aur godown me transfer kiya ja sakta hai." },
      { term: "CG (combined row)", meaning: "CG location ka row iske 4 sub-godowns (Warehouse, Maniquip, Service Inbound, Head Office) ka combined total dikhata hai - PFMS Material Received aur OTP Packing List se exact sub-godown track hota hai backend me, but Inventory page pe ek hi aggregated CG row dikhta hai." },
      { term: "Max Level", meaning: "Off-season (Jun-Sep) ka target stock level - formula se calculate hota hai: Avg Sale/Day x Lead Time x Safety Factor x Growth Rate. Inventory page ke 'Max Level' button se recalculate hota hai." },
      { term: "Max Level Peak", meaning: "Peak season (Oct-May) ka target stock level - same formula, lekin sirf Oct-May ke sales data se Avg Sale/Day nikalta hai." },
      { term: "Indent Raised", meaning: "PFMS me is item ke liye kitni qty approve ho chuki hai lekin abhi PO/vendor stage pe process ho rahi hai." },
      { term: "PO Qty", meaning: "PO ban chuka hai is item ke liye, lekin vendor se abhi poori qty lift/dispatch nahi hui - outstanding purchase order qty." },
      { term: "In-Transit Qty", meaning: "Vendor ne dispatch kar diya hai, lekin transporter abhi 'received' mark nahi kiya - raaste me hai." },
      { term: "Target Qty", meaning: "Live Stock + In-Transit Qty - matlab jo abhi hai + jo raaste me hai, dono milakar kitna hoga." },
      { term: "Reorder Qty", meaning: "Max Level - (Live Stock + Indent Raised) - agar positive hai, to itni qty ka naya order/indent raise karna chahiye." },
      { term: "Lead Time (days)", meaning: "Is item ka stock kitne dino me aane ki umeed hai - PFMS ke alag-alag stages me se jo sabse jaldi wali date mile, wahi." },
      { term: "Total Sales Qty / Value", meaning: "OTP ke Pre-Invoice me abhi jo PENDING hai (dispatch hone wala hai, invoice nahi bani) uski qty aur value - yeh 'abhi bikne wala' hai, 'pehle bik chuka' nahi." },
      { term: "Transfer IN / OUT", meaning: "Stock Transfer se is location me kitna aaya (IN) ya gaya (OUT)." },
      { term: "Serials of Live Stock", meaning: "Button dabane se modal khulta hai jisme is item ke har physical piece ka Serial Number aur wo kis PFMS Lift (batch) se aaya, dikhta hai." },
      { term: "Nearest Warranty Expiry", meaning: "Stock me pade serials me se jiski warranty sabse pehle khatam hone wali hai, uski date." },
      { term: "Nearest Invoice Date", meaning: "Jin serials ki koi warranty nahi hai, unme se sabse purana invoice date (fallback jab warranty na ho)." },
      { term: "Status (Fast/Slow/Non-Moving)", meaning: "Pichhle 90 din me is item ka kitna OUT movement hua, uske basis par - zyada OUT = Fast, kam = Slow, bilkul nahi = Non-Moving." },
    ],
  },
  {
    title: "ABC / FSN Analysis - Seasonality (Section 1)",
    terms: [
      { term: "Sales Value", meaning: "Us mahine me jitni bhi invoices bani (OTP ke Make Invoice stage se), unki total value." },
      { term: "Share of FY Sales", meaning: "Is mahine ne poore financial year ke total sales me kitna % contribute kiya." },
      { term: "Seasonal Index", meaning: "Is mahine ki sales divided by average monthly sales. 1.0 se zyada matlab average se upar, kam matlab average se neeche." },
      { term: "Planning Interpretation", meaning: "Seasonal Index ke basis par ek simple label - batata hai is mahine ke liye stock planning kaisi honi chahiye (neeche dekho)." },
      { term: "Lean / clean excess (below 0.90x)", meaning: "Demand average se kaafi kam - naya stock mat banao, jo extra pada hai use clear karo." },
      { term: "Normal / recovery (0.90 to 1.00x)", meaning: "Demand lagbhag average jaisi hai, kuch khaas action ki zaroorat nahi." },
      { term: "Regular-high (1.00 to 1.10x)", meaning: "Demand average se thoda upar - normal replenishment chaalu rakho." },
      { term: "Peak / protect availability (above 1.10x)", meaning: "Demand sabse zyada - pehle se stock tayyar rakho taaki stock-out na ho." },
      { term: "Qty Sold", meaning: "Us mahine me total kitni quantity (units) bik gayi." },
      { term: "Sales Lines", meaning: "Us mahine me kitni alag invoice-item entries thi (1 invoice ka 1 item = 1 line) - order activity kitni 'bikhri hui' hai iska indicator." },
    ],
  },
  {
    title: "ABC / FSN Analysis - Classification (Section 2 & 3)",
    terms: [
      { term: "A / B / C (value-based)", meaning: "Items ko unki revenue contribution se rank karke: A = top 70% revenue dene wale, B = agla 20%, C = baaki 10%." },
      { term: "F / S / N (movement-based)", meaning: "Item kitne mahino me 'active' (bika) tha uske basis par: F = zyada 50% mahino me bika, S = 25-50%, N = kam 25%." },
      { term: "Combined Class (e.g. AF, CN)", meaning: "A/B/C aur F/S/N ko mila ke ek final class - pehla letter = kitna revenue important hai, doosra = kitna consistently bikta hai." },
      { term: "SKU Count", meaning: "Us class me kitne alag items (SKUs) aate hai." },
      { term: "Sales Share", meaning: "Us poori class ka combined revenue, company ke total revenue ka kitna % hai." },
      { term: "Control Policy", meaning: "Us class ke items ko overall kitni tight/loose monitoring chahiye - jitna zyada value-critical, utna tight control." },
      { term: "Review", meaning: "Kitni baar is class ka stock check/review karna chahiye (Weekly / Fortnightly / Monthly)." },
      { term: "Peak Handling", meaning: "Seasonal peak aane par kya karna hai - pehle se stock bana ke rakhna hai (pre-build) ya sirf confirmed order pe hi mangana hai." },
      { term: "Stocking Rule", meaning: "Asli buffer/safety-stock policy - kitna extra stock rakhna hai ya bilkul nahi rakhna (jaise MTO = Make To Order, sirf order confirm hone par banao)." },
      { term: "Active Months", meaning: "Kitne mahino me is item ki kam se kam 1 unit bhi biki - FSN class isi se nikalta hai." },
      { term: "Avg Monthly Qty", meaning: "Total qty sold divided by elapsed months - average har mahine kitna bikta hai." },
      { term: "Peak/Avg", meaning: "Sabse zyada bika hua mahina divided by average mahina - jitna zyada yeh ratio, utna unpredictable/spiky demand hai." },
      { term: "Recommended Policy", meaning: "Control Policy + Stocking Rule ka ek-line summary, us specific item ke liye - seedha action lene ke liye." },
      { term: "Priority Review order", meaning: "A-class items pehle dikhaye jate hai, aur unme bhi N (unpredictable) pehle, S beech me, F sabse baad - kyunki unpredictable high-value items ko sabse zyada attention chahiye." },
    ],
  },
  {
    title: "The 9 Combined Classes - Quick Meaning",
    terms: [
      { term: "AF", meaning: "High revenue + regularly bikta hai -> core stock item, hamesha available rakho." },
      { term: "AS", meaning: "High revenue + beech-beech me bikta hai -> controlled stock, zyada build mat karo." },
      { term: "AN", meaning: "High revenue + kabhi-kabhi bikta hai -> sirf confirmed order pe mangao (MTO), stock mat banao." },
      { term: "BF", meaning: "Medium revenue + regularly bikta hai -> normal min-max stocking." },
      { term: "BS", meaning: "Medium revenue + beech-beech me bikta hai -> kam buffer ke saath periodic restock." },
      { term: "BN", meaning: "Medium revenue + kabhi-kabhi bikta hai -> routine stock avoid karo, order-backed raho." },
      { term: "CF", meaning: "Low revenue + regularly bikta hai -> low-cost item, kam buffer me regular restock." },
      { term: "CS", meaning: "Low revenue + beech-beech me bikta hai -> selectively hi buy karo." },
      { term: "CN", meaning: "Low revenue + kabhi-kabhi bikta hai -> bilkul stock mat karo, jab order aaye tabhi mangao." },
    ],
  },
];

export default function GlossaryPage() {
  return (
    <MainLayout>
      <GlossaryContent />
    </MainLayout>
  );
}

function GlossaryContent() {
  const [search, setSearch] = useState("");

  const filteredGroups = GROUPS.map((g) => ({
    ...g,
    terms: g.terms.filter(
      (t) =>
        !search.trim() ||
        t.term.toLowerCase().includes(search.toLowerCase()) ||
        t.meaning.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((g) => g.terms.length > 0);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader title="Glossary" description="Har column/abbreviation ka simple meaning - ek jagah" />

      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search term or meaning" }}
        chips={search.trim() ? [{ key: "q", label: `Search: ${search.trim()}`, onRemove: () => setSearch("") }] : []}
        onClearAll={() => setSearch("")}
      />

      {filteredGroups.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            title="No matching terms"
            description="Try a different word, or clear the search."
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear search
              </Button>
            }
          />
        </div>
      ) : (
        filteredGroups.map((g) => (
          <section key={g.title} className="overflow-hidden rounded-lg border border-brand-200 bg-card shadow-sm" aria-label={g.title}>
            <h2 className="border-b border-brand-200 bg-secondary px-4 py-2.5 text-sm font-semibold text-brand-800">{g.title}</h2>
            <dl className="divide-y">
              {g.terms.map((t) => (
                <div key={t.term} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
                  <dt className="shrink-0 text-sm font-semibold text-brand-700 sm:w-60">{t.term}</dt>
                  <dd className="text-sm text-muted-foreground">{t.meaning}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
    </div>
  );
}
