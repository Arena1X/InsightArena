import type { ReactNode } from "react";
import Header from "@/component/Header";
import Footer from "@/component/Footer";
import PageBackground from "@/component/PageBackground";

export default function InviteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <PageBackground />
      <div className="relative z-10">
        <Header />
        <main className="max-w-5xl mx-auto px-4 pt-32 pb-20 sm:px-6">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
