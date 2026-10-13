"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "./table-states";
import { TablePagination } from "./table-pagination";

export type DataColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Pixel width. Required for `sticky` columns (offsets are computed from it). */
  width?: number;
  /**
   * Pin to the left edge while scrolling horizontally. `"lg"` pins only on wide
   * screens (>=1024px) so pinned columns never swallow a phone/tablet viewport.
   */
  sticky?: boolean | "lg";
  /** Pin to the right edge (use for the row-actions column so it is always reachable). */
  stickyRight?: boolean;
  /** Let long text wrap instead of staying on one line. */
  wrap?: boolean;
  /** Start hidden; the user can turn it on from the column selector. */
  defaultHidden?: boolean;
};

export type ColumnVisibility = Record<string, boolean>;

export function defaultColumnVisibility<T>(columns: DataColumn<T>[]): ColumnVisibility {
  return Object.fromEntries(columns.map((c) => [c.id, !c.defaultHidden]));
}

type SortState = { id: string; dir: "asc" | "desc" } | null;

type DataTableProps<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  visibility?: ColumnVisibility;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  /** Accessible name for the table. */
  label: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  /** Tailwind max-height for the scroll area; the header stays pinned inside it. */
  maxHeightClassName?: string;
};

const ALIGN: Record<NonNullable<DataColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right tabular-nums",
  center: "text-center tabular-nums",
};

function compare(a: string | number | null | undefined, b: string | number | null | undefined) {
  const aNil = a === null || a === undefined || a === "";
  const bNil = b === null || b === undefined || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1; // blanks always last
  if (bNil) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  visibility,
  loading = false,
  error = null,
  onRetry,
  empty = { title: "No records found" },
  label,
  pageSizeOptions = [25, 50, 100],
  defaultPageSize = 50,
  maxHeightClassName = "max-h-[calc(100dvh-20rem)] min-h-[320px]",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const visibleColumns = useMemo(
    () => columns.filter((c) => (visibility ? visibility[c.id] !== false : !c.defaultHidden)),
    [columns, visibility],
  );

  // Left offsets for pinned columns.
  const stickyOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let left = 0;
    for (const c of visibleColumns) {
      if (!c.sticky) continue;
      offsets[c.id] = left;
      left += c.width ?? 120;
    }
    return offsets;
  }, [visibleColumns]);
  const lastStickyId = useMemo(
    () => [...visibleColumns].reverse().find((c) => c.sticky)?.id,
    [visibleColumns],
  );
  // Last always-pinned column: it is the visible edge below lg, where "lg" columns scroll normally.
  const lastAlwaysStickyId = useMemo(
    () => [...visibleColumns].reverse().find((c) => c.sticky === true)?.id,
    [visibleColumns],
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // keep blanks last regardless of direction
      const aNil = av === null || av === undefined || av === "";
      const bNil = bv === null || bv === undefined || bv === "";
      if (aNil || bNil) return compare(av, bv);
      return compare(av, bv) * factor;
    });
  }, [rows, columns, sort]);

  // A new result set (filter, refresh) starts from page 1.
  useEffect(() => {
    setPage(0);
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sortedRows, safePage, pageSize],
  );

  const toggleSort = (id: string) => {
    setSort((s) => {
      if (!s || s.id !== id) return { id, dir: "asc" };
      if (s.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  };

  const cellStyle = (c: DataColumn<T>): React.CSSProperties => ({
    width: c.width,
    minWidth: c.width,
    left: c.sticky ? stickyOffsets[c.id] : undefined,
    right: c.stickyRight ? 0 : undefined,
  });

  const stickyClasses = (c: DataColumn<T>, header: boolean) => {
    if (c.stickyRight) return cn("sticky border-l shadow-[-2px_0_0_0_hsl(var(--border))]", header ? "z-20" : "z-[1]");
    if (!c.sticky) return "";
    const lg = c.sticky === "lg";
    const edge = c.id === lastStickyId || (!lg && c.id === lastAlwaysStickyId);
    return cn(
      lg ? "lg:sticky" : "sticky",
      header ? (lg ? "lg:z-20" : "z-20") : lg ? "lg:z-[1]" : "z-[1]",
      c.id === lastStickyId &&
        (lg ? "lg:border-r lg:shadow-[2px_0_0_0_hsl(var(--border))]" : "border-r shadow-[2px_0_0_0_hsl(var(--border))]"),
      // when a wide-only pinned column follows, the always-pinned one still needs an edge below lg
      !lg && edge && c.id !== lastStickyId && "max-lg:border-r max-lg:shadow-[2px_0_0_0_hsl(var(--border))]",
    );
  };

  const showBody = !loading && !error && sortedRows.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-brand-200 bg-card shadow-sm">
      <div
        className={cn("overflow-auto", maxHeightClassName)}
        tabIndex={0}
        role="region"
        aria-label={`${label}, scrollable`}
      >
        <table aria-label={label} className="w-max min-w-full border-separate border-spacing-0 text-[13px] leading-5">
          <thead>
            <tr>
              {visibleColumns.map((c) => {
                const active = sort?.id === c.id ? sort.dir : null;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (active === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined}
                    style={cellStyle(c)}
                    className={cn(
                      "sticky top-0 z-10 whitespace-nowrap border-b border-brand-200 bg-secondary px-3 py-2.5 text-xs font-semibold text-brand-800",
                      ALIGN[c.align ?? "left"],
                      stickyClasses(c, true),
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          c.align === "right" && "flex-row-reverse",
                          active && "text-brand-600",
                        )}
                      >
                        {c.header}
                        {active === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden />
                        ) : active === "desc" ? (
                          <ArrowDown className="h-3 w-3" aria-hidden />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {visibleColumns.map((c) => (
                    <td key={c.id} style={cellStyle(c)} className={cn("border-b bg-card px-3 py-3", stickyClasses(c, false))}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))}

            {showBody &&
              pageRows.map((row) => (
                <tr key={getRowId(row)} className="group">
                  {visibleColumns.map((c) => (
                    <td
                      key={c.id}
                      style={cellStyle(c)}
                      className={cn(
                        "border-b px-3 py-2.5 align-middle group-hover:bg-secondary",
                        ALIGN[c.align ?? "left"],
                        c.wrap ? "whitespace-normal break-words" : "whitespace-nowrap",
                        (c.sticky || c.stickyRight) && "bg-card",
                        stickyClasses(c, false),
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>

        {error && !loading && <ErrorState message={error} onRetry={onRetry} />}
        {!error && !loading && sortedRows.length === 0 && (
          <EmptyState title={empty.title} description={empty.description} action={empty.action} />
        )}
      </div>

      <TablePagination
        page={safePage}
        pageSize={pageSize}
        total={error ? 0 : sortedRows.length}
        pageSizeOptions={pageSizeOptions}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(0);
        }}
      />
    </div>
  );
}
