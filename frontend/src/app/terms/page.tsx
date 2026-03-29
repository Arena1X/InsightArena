import React from 'react';

const TermsPage = () => {
  const lastUpdated = "March 29, 2026";

  const sections = [
    {
      id: "acceptance",
      title: "1. Acceptance of Terms",
      content: "By accessing or using InsightArena, you agree to be bound by these Terms of Service. If you do not agree to all of these terms, do not use the platform. Your continued use signifies your acceptance of any future updates."
    },
    {
      id: "responsibilities",
      title: "2. User Responsibilities",
      content: "Users are responsible for maintaining the security of their account credentials. You agree not to use the service for any illegal activities, including but not limited to money laundering, fraud, or unauthorized data scraping."
    },
    {
      id: "trading",
      title: "3. Trading Rules",
      content: "InsightArena provides tools for market analysis and simulated/live trading. Users must adhere to fair trading practices. Any attempt to manipulate market data, exploit latency, or use unauthorized automated bots will result in immediate account suspension."
    },
    {
      id: "disclaimers",
      title: "4. Disclaimers",
      content: "InsightArena provides data 'as is' without warranties of any kind. We do not guarantee the accuracy, completeness, or timeliness of financial data. All trading involves risk, and users should perform their own due diligence."
    },
    {
      id: "liability",
      title: "5. Limitation of Liability",
      content: "To the maximum extent permitted by law, InsightArena and its affiliates shall not be liable for any indirect, incidental, or consequential damages, including loss of profits, data, or funds resulting from your use of the platform."
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300">
      <div className="max-w-6xl mx-auto px-6 py-20">
        
        {/* Header Section */}
        <header className="mb-16 border-b border-gray-800 pb-8">
          <h1 className="text-4xl font-extrabold text-white mb-4">Terms of Service</h1>
          <p className="text-gray-500 font-mono text-sm uppercase tracking-wider">Last Updated: {lastUpdated}</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-16">
          
          {/* Table of Contents - Sidebar */}
          <aside className="lg:w-1/4">
            <nav className="sticky top-28 bg-[#111] p-6 rounded-xl border border-gray-800">
              <h2 className="text-white font-bold mb-6 text-xs uppercase tracking-widest text-orange-500">Navigation</h2>
              <ul className="space-y-4">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a 
                      href={`#${section.id}`} 
                      className="text-sm hover:text-orange-500 transition-colors duration-200 block"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Legal Content */}
          <article className="lg:w-3/4 space-y-16">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28">
                <h2 className="text-2xl font-bold text-white mb-6 border-l-4 border-orange-500 pl-4">
                  {section.title}
                </h2>
                <p className="text-lg leading-relaxed text-gray-400">
                  {section.content}
                </p>
              </section>
            ))}
            
            <footer className="pt-12 border-t border-gray-800 italic text-sm text-gray-500">
              For legal inquiries, contact: legal@insightarena.com
            </footer>
          </article>
          
        </div>
      </div>
    </div>
  );
};

export default TermsPage;