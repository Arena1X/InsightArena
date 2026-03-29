import Button from '@/components/Button';
import { useState } from "react";
import { Progress } from "@/component/ui/progress";
import { BookOpen } from "lucide-react";

interface Course {
  name: string;
  progress: number;
  completedLessons: number;
  totalLessons: number;
}

const tabs = [
  {
    label: "Lesson Content",
    value: "lesson",
  },
  {
    label: "NFT Badges",
    value: "nft",
  },
]

export default function YourCoursesCard({ courses }: { courses: Course[] }) {
  const [activeTab, setActiveTab] = useState("lesson");

  return (
    <div className="w-full">
      {/* Tabs fuera del card principal */}
      <div className="flex gap-2 bg-[#D1D5DB] rounded-xl px-3 py-2 w-fit mb-6">
        {tabs.map((tab) => (
          <Button
            key={tab.value}
            className={`px-6 py-2 rounded-lg font-bold text-base transition-all duration-200 ${activeTab === tab.value ? "bg-[#232228] text-white" : "bg-[#D1D5DB] text-[#232228]"} cursor-pointer`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {/* Card principal */}
      <div className="bg-[#232228] rounded-2xl px-10 py-8 w-full shadow-md">
        {activeTab === "lesson" && (
          <>
            <h2 className="text-2xl font-bold text-white mb-1 text-left">Your Courses</h2>
            <p className="text-gray-300 text-base mb-8 text-left">Track Your Progress Across All Courses</p>
            {courses.map((course, idx) => (
              <div key={idx} className="mb-10 last:mb-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-lg text-white">{course.name}</span>
                  <span className="border border-white text-white text-xs px-4 py-1 rounded-full bg-transparent font-semibold">
                    {course.progress}% Complete
                  </span>
                </div>
                <Progress value={course.progress} className="h-2 bg-[#D1D5DB] rounded-full [&>div]:bg-[#9747FF]" />
                <div className="flex items-center gap-2 text-gray-300 text-sm mt-3">
                  <BookOpen className="w-5 h-5" />
                  <span>{course.completedLessons} Of {course.totalLessons} Lesson Completed</span>
                </div>
              </div>
            ))}
          </>
        )}
        {activeTab === "nft" && (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="text-gray-400 text-lg">NFT Badges content coming soon...</span>
          </div>
        )}
      </div>
    </div>
  );
} 