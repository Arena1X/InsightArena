"use client"
import { useState } from 'react';
import { ChevronLeft, Plus, Minus } from 'lucide-react';

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  isOpen: boolean;
}

export default function CryptoFAQ() {
  const [faqItems, setFaqItems] = useState<FAQItem[]>([
    {
      id: 1,
      question: "What Is Cryptocurrency?",
      answer: "Cryptocurrency Is A Digital Form Of Money That Uses Blockchain Technology And Encryption To Secure Transactions. Bitcoin, Ethereum, And StarkNet Are Popular Examples. Unlike Traditional Currencies, It's Not Controlled By A Central Authority.",
      isOpen: true
    },
    {
      id: 2,
      question: "How Does Blockchain Work?",
      answer: "Blockchain is a distributed ledger technology that records transactions across many computers. Each block contains a timestamp and transaction data, and is linked to the previous block, creating a chain. This makes it secure and resistant to modification.",
      isOpen: false
    },
    {
      id: 3,
      question: "How Does The Tournament For Tutors Works?",
      answer: "The Tournament for Tutors is a competition where cryptocurrency educators compete to provide the best learning experience. Participants are ranked based on student success rates, content quality, and community feedback.",
      isOpen: false
    },
    {
      id: 4,
      question: "Do I Need Coding Skills To Learn Crypto?",
      answer: "No, you don't need coding skills to learn about or invest in cryptocurrency. However, understanding some technical concepts can be helpful. Many platforms now offer user-friendly interfaces for beginners.",
      isOpen: false
    }
  ]);

  const toggleFAQ = (id: number) => {
    setFaqItems(faqItems.map(item => 
      item.id === id ? { ...item, isOpen: !item.isOpen } : item
    ));
  };

  return (
    <div className="min-h-screen bg-black text-white flex justify-center items-center">
      <div className="w-full max-w-3xl mx-auto p-6 rounded-lg bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-700">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Frequently Ask Questions</h1>
        </div>
        
        <div className="mb-4">
          <button className="flex items-center text-gray-300 hover:text-white">
            <ChevronLeft size={20} />
            <span className="ml-1">Back to home</span>
          </button>
        </div>
        
        <div className="space-y-4">
          {faqItems.map(item => (
            <div 
              key={item.id} 
              className="bg-white rounded-lg overflow-hidden mb-4"
            >
              <div 
                className="flex justify-between items-center p-4 cursor-pointer text-black"
                onClick={() => toggleFAQ(item.id)}
              >
                <h3 className="font-semibold text-lg">{item.id}. {item.question}</h3>
                <button className="p-1 rounded-full bg-black">
                  {item.isOpen ? 
                    <Minus size={16} className="text-white" /> : 
                    <Plus size={16} className="text-white" />
                  }
                </button>
              </div>
              
              {item.isOpen && (
                <div className="p-4 bg-white text-black border-t border-gray-200">
                  <p>{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-6">
          <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}