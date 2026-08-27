import React from "react";
import { render, screen } from "@testing-library/react";
import {
  COURSE_PROGRESS_STORAGE_KEY,
  getResumeLesson,
  getViewedLessonIds,
  markLessonViewed,
  type CourseLesson,
} from "./utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CourseCard from "../component/CourseCard";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

const lessons: CourseLesson[] = [
  { id: "intro", title: "Introduction", href: "/courses/crypto-101/intro" },
  { id: "wallets", title: "Wallets", href: "/courses/crypto-101/wallets" },
  { id: "markets", title: "Markets", href: "/courses/crypto-101/markets" },
];

describe("course progress", () => {
  beforeEach(() => localStorage.clear());

  it("persists viewed lesson ids in local storage", () => {
    markLessonViewed("crypto-101", "intro");
    markLessonViewed("crypto-101", "wallets");

    expect(getViewedLessonIds("crypto-101")).toEqual(["intro", "wallets"]);
    expect(JSON.parse(localStorage.getItem(COURSE_PROGRESS_STORAGE_KEY)!)).toEqual({
      "crypto-101": ["intro", "wallets"],
    });
  });

  it("returns the first unviewed lesson as the resume target", () => {
    markLessonViewed("crypto-101", "intro");

    expect(getResumeLesson("crypto-101", lessons)).toEqual(lessons[1]);
  });

  it("renders persisted viewed state and the resume action", () => {
    markLessonViewed("crypto-101", "intro");

    render(
      <CourseCard
        title="Crypto 101"
        description="Learn the basics."
        lessonCount={lessons.length}
        duration={30}
        level="Beginner"
        courseId="crypto-101"
        lessons={lessons}
      />,
    );

    expect(screen.getByText("1/3 lessons viewed")).toBeInTheDocument();
    expect(screen.getByLabelText("Introduction: viewed")).toBeInTheDocument();
    expect(screen.getByLabelText("Wallets: not viewed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /resume where you left off/i })).toHaveAttribute(
      "href",
      "/courses/crypto-101/wallets",
    );
  });
});