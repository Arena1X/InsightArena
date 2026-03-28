import React, { useState } from 'react';
import { X, Users, Award, Check } from 'lucide-react';

interface CourseCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CourseCompletionModal = ({ isOpen, onClose }: CourseCompletionModalProps) => {
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  const [badgeClaimed, setBadgeClaimed] = useState(false);

  const handleJoinCommunity = async () => {
    setIsJoinLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      window.open('https://t.me/+wG8gxRxwrzQxNTk0', '_blank');
    } finally {
      setIsJoinLoading(false);
    }
  };

  const handleClaimBadge = async () => {
    setIsClaimLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setBadgeClaimed(true);
    } finally {
      setIsClaimLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        className="backdrop-blur-3xl border-2 border-gray-400 bg-white/5 z-50 mx-auto w-full max-w-md rounded-xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-completion-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6">
              <h2 id="course-completion-title" className="text-white text-2xl font-bold">
                Stark Academy
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-white w-8 h-8 rounded-full border border-gray-600 hover:border-gray-400 flex items-center justify-center transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
        

        {/* Content */}
        <div className="p-6">
          <div className="text-gray-300 mb-6">
            <img
              src="/assets/modal_img.png"
              alt="Celebration illustration for course completion"
              className="w-40 h-auto mx-auto"
            />
            <p className="mb-4 text-center pt-2">
            CONGRATULATION ON FINISHING YOUR COURSE  TIME TO CLAIM YOUR BADGE.
            </p>
            
            {badgeClaimed && (
              <div className="flex items-center gap-2  text-green-700 p-3 rounded-lg mb-4">
                <Check className="w-5 h-5" />
                <span>Badge claimed successfully!</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleClaimBadge}
              disabled={isClaimLoading || badgeClaimed}
              className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 ${
                badgeClaimed 
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {isClaimLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Award className="w-5 h-5" />
                  {badgeClaimed ? 'Claimed' : 'Claim Badge'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleJoinCommunity}
              disabled={isJoinLoading}
              className="flex-1 py-3 px-4 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
            >
              {isJoinLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Users className="w-5 h-5" />
                  Join Community
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseCompletionModal;
