import Header from '@/component/Header';
import Footer from "@/component/Footer";
import PageBackground from "@/component/PageBackground";
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
    <PageBackground>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-6 py-20 pt-28">
            <header className="mb-16 border-b border-white/10 pb-8">
              <h1 className="mb-4 text-4xl font-extrabold text-white">
                Terms of Service
              </h1>
              <p className="font-mono text-sm uppercase tracking-wider text-gray-300/70">
                Last Updated: {lastUpdated}
              </p>
            </header>

            <div className="flex flex-col gap-16 lg:flex-row">
              <aside className="lg:w-1/4">
                <nav className="sticky top-28 rounded-xl border border-white/10 bg-[#111726] p-6">
                  <h2 className="mb-6 text-xs font-bold uppercase tracking-widest text-orange-500">
                    Navigation
                  </h2>
                  <ul className="space-y-4">
                    {sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="block text-sm text-gray-200 hover:text-orange-500 transition-colors duration-200"
                        >
                          {section.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>

              <article className="space-y-16 lg:w-3/4">
                {sections.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-28"
                  >
                    <h2 className="mb-6 border-l-4 border-orange-500 pl-4 text-2xl font-bold text-white">
                      {section.title}
                    </h2>
                    <p className="text-lg leading-relaxed text-gray-300/80">
                      {section.content}
                    </p>
                  </section>
                ))}

                <footer className="border-t border-white/10 pt-12 text-sm italic text-gray-300/70">
                  For legal inquiries, contact: legal@insightarena.com
                </footer>
              </article>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </PageBackground>
  );
};

export default TermsPage;
