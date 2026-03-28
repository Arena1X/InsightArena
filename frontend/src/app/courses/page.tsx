import Link from "next/link";
import CourseCard from "@/component/CourseCard";
import Footer from "@/component/Footer";
import Coursenav from "@/component/coursenav";

export default function CoursesPage() {
  // Course data based on the image
  const cryptoCourses = [
    {
      id: 1,
      title: "What is crypto?",
      description:
        "Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms, And Cryptography.",
      lessonCount: 4,
      duration: 30,
      level: "Advanced Level",
    },
    {
      id: 2,
      title: "What is crypto?",
      description:
        "Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms, And Cryptography.",
      lessonCount: 4,
      duration: 30,
      level: "Advanced Level",
    },
    {
      id: 3,
      title: "What is crypto?",
      description:
        "Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms, And Cryptography.",
      lessonCount: 4,
      duration: 30,
      level: "Advanced Level",
    },
    {
      id: 4,
      title: "What is crypto?",
      description:
        "Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms, And Cryptography.",
      lessonCount: 4,
      duration: 30,
      level: "Advanced Level",
    },
    {
      id: 5,
      title: "What is crypto?",
      description:
        "Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms, And Cryptography.",
      lessonCount: 4,
      duration: 30,
      level: "Advanced Level",
    },
    {
      id: 6,
      title: "What is crypto?",
      description:
        "Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms, And Cryptography.",
      lessonCount: 4,
      duration: 30,
      level: "Advanced Level",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header with Navigation */}
      <Coursenav />

      {/* Back button */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          href="/"
          className="flex items-center text-gray-300 hover:text-white"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back Home
        </Link>
      </div>

      {/* Courses Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {cryptoCourses.map((course) => (
            <CourseCard
              key={course.id}
              title={course.title}
              description={course.description}
              lessonCount={course.lessonCount}
              duration={course.duration}
              level={course.level}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
