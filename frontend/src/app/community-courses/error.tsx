"use client";

import { RouteErrorState } from "@/component/route-error-state";

type CommunityCoursesErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CommunityCoursesErrorPage({
  error,
  reset,
}: CommunityCoursesErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Community Courses"
      description="We couldn't load the community courses right now. Try again to refresh the page and continue learning."
    />
  );
}
