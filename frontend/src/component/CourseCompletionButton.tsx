import React, { useState } from 'react';
import CourseCompletionModal from './CourseCompletionModal';

interface CourseCompletionButtonProps {
  courseId?: string;
}

const CourseCompletionButton = ({ courseId }: CourseCompletionButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
      >
        View Course Completion
      </button>

      <CourseCompletionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        courseId={courseId}
      />
    </>
  );
};

export default CourseCompletionButton;