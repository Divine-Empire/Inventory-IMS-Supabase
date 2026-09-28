import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
        <Construction className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-lg font-extrabold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
