import Link from "next/link";
import type { ProviderInfo } from "@/lib/data";

export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="in page">{children}</main>;
}

/** Breadcrumbs: Home › … Items without an href are the current page. */
export function Crumbs({ items }: { items: [string, string?][] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link href="/">Home</Link>
      {items.map(([label, href]) => (
        <span key={label}>
          <span aria-hidden="true">›</span>{" "}
          {href ? (
            <Link href={href}>{label}</Link>
          ) : (
            <span aria-current="page" className="muted">
              {label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Link to the provider's site. Affiliate links are labeled and marked sponsored. */
export function OutLink({ provider }: { provider: Pick<ProviderInfo, "name" | "websiteUrl" | "affiliateUrl"> }) {
  const href = provider.affiliateUrl ?? provider.websiteUrl;
  if (!href || !/^https?:\/\//i.test(href)) return null;
  const affiliate = !!provider.affiliateUrl;
  return (
    <li>
      <a href={href} rel={affiliate ? "sponsored nofollow noopener" : "nofollow noopener"} target="_blank">
        {provider.name} website ↗
      </a>
      {affiliate && <span className="muted"> · affiliate link</span>}
    </li>
  );
}
