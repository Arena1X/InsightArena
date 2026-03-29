"use client";

import { RouteErrorState } from "@/component/route-error-state";

type CoursesErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CoursesErrorPage({
  error,
  reset,
}: CoursesErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Courses"
      description="We hit a snag while loading the courses catalog. Try again and we'll attempt to restore the page."
    />
  );
}
