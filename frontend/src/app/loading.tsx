"use client";

import { useEffect } from "react";
import { MarketingPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { beginRouteContentLoad } from "@/lib/utils";

export default function Loading() {
  useEffect(() => beginRouteContentLoad(), []);

  return <MarketingPageLoadingSkeleton />;
}
