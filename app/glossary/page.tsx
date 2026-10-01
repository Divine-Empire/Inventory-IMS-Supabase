"use client";

import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Badge } from "@/components/ui/badge";

type Term = { term: string; meaning: string };
type Group = { title: string; terms: Term[] };

const GROUPS: Group[] = [
  {
    title: "Inventory Page - Columns",
    terms: [
      { term: "Live Stock", meaning: "Kitna actual stock abhi us location pe hai - IN/OUT/Transfer sab ledger entries ka running total." },
      { term: "Max Level", meaning: "Normal (non-peak season) ke liye yeh item kitna stock me hona chahiye - CSV import se set hota hai." },
      { term: "Max Level Peak", meaning: "Peak/busy season ke liye target stock level - Max Level se alag, zyada hota hai." },
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
    <div className="p-6 flex flex-col gap-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-violet-600" /> Glossary
            </h1>
            <p className="text-xs text-slate-500">Har column/abbreviation ka simple meaning - ek jagah</p>
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search term..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-full w-64 bg-white"
          />
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-10">No matching terms</p>
      ) : (
        filteredGroups.map((g) => (
          <div key={g.title} className="border border-slate-300 rounded-lg bg-white overflow-hidden">
            <div className="bg-slate-900 text-white px-4 py-2.5">
              <h2 className="text-xs font-extrabold uppercase tracking-wide">{g.title}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {g.terms.map((t) => (
                <div key={t.term} className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-3">
                  <div className="sm:w-56 shrink-0">
                    <Badge variant="outline" className="font-bold">{t.term}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{t.meaning}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
