import React from "react";
import { useModalA11y } from "@/hooks/useModalA11y";

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

const ResourcesModal: React.FC<ModalProps> = ({ open, onClose }) => {
  const { containerRef, titleId } = useModalA11y({ isOpen: open, onClose });

  if (!open) return null;

  return (
    <>
      {/* Invisible backdrop — closes the modal when clicking outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

      {/* Modal panel */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute top-full right-5 mt-2 z-50 bg-[#090808] border border-white p-6 rounded-lg shadow-xl w-100"
      >
        {/* Close button — first focusable element, receives initial focus */}
        <button
          onClick={onClose}
          aria-label="Close learning resources menu"
          className="absolute top-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 id={titleId} className="text-xl font-bold text-white">
          Learning Resources
        </h2>
        <h6 className="text-white mb-5">
          Tools, guides and references for Web3 learning
        </h6>

        <div className="pl-2">
          <div className="mb-5 hover:bg-[#444444] hover:border border-r-white p-3 rounded-md">
            <strong className="text-xl font-bold text-white">External Tools</strong>
            <p>
              Curated links to DEXes, DeFi Platforms, wallets and Staking sites.
            </p>
          </div>

          <div className="hover:bg-[#444444] hover:border border-r-white p-3 rounded-md">
            <strong className="text-xl font-bold text-white">Web Glossary</strong>
            <p>Comprehensive dictionary of blockchain and Web3 terms.</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResourcesModal;
