import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Shared card shell for a chart/section: title, optional "ver todo" link, an
// optional footer caption, and the chart body as children.
export function ChartCard({
  title,
  href,
  linkLabel = "Ver todo",
  children,
  footer,
  right,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
        {right}
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {linkLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
      {footer && <div className="mt-3 text-xs text-neutral-400">{footer}</div>}
    </div>
  );
}
