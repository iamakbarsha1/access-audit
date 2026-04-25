import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { TrackPageview } from "@/components/marketing/track-pageview";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="pt-16">{children}</main>
      <MarketingFooter />
      <TrackPageview />
    </div>
  );
}
