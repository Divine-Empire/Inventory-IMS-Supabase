"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColumnVisibility, DataColumn } from "./data-table";

export function ColumnSelector<T>({
  columns,
  visibility,
  onChange,
}: {
  columns: DataColumn<T>[];
  visibility: ColumnVisibility;
  onChange: (next: ColumnVisibility) => void;
}) {
  const shown = columns.filter((c) => visibility[c.id] !== false).length;
  const setAll = (value: boolean) => onChange(Object.fromEntries(columns.map((c) => [c.id, value])));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Columns3 className="h-4 w-4" aria-hidden />
          Columns
          <span className="text-muted-foreground">
            {shown}/{columns.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Visible columns</p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAll(true)}>
              Show all
            </Button>
          </div>
        </div>
        <ul className="max-h-72 overflow-auto py-1">
          {columns.map((c) => {
            const id = `col-${c.id}`;
            return (
              <li key={c.id}>
                <label htmlFor={id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent">
                  <Checkbox
                    id={id}
                    checked={visibility[c.id] !== false}
                    onCheckedChange={(v) => onChange({ ...visibility, [c.id]: v === true })}
                  />
                  {c.header}
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
