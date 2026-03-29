import React, { useState } from 'react';
import Button from '@/components/Button';
import CourseCompletionModal from './CourseCompletionModal';

const CourseCompletionButton = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
      >
        View Course Completion
      </Button>

      <CourseCompletionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default CourseCompletionButton; 