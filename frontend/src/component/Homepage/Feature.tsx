import {
  TrendingUp,
  Wallet,
  Lock,
  Scale,
  BarChart2,
  Trophy,
} from 'lucide-react';
import { Card, CardContent } from "@/component/ui/card";
import { motion } from "framer-motion";

const features = [
  {
    icon: TrendingUp,
    title: 'Create Custom Markets',
    body: 'Propose new prediction markets on any public event, sports, or crypto price.',
  },
  {
    icon: Wallet,
    title: 'Predict on Anything',
    body: 'Put your XLM where your mouth is. Take positions on your strongest convictions.',
  },
  {
    icon: Trophy,
    title: 'Automated Resolution',
    body: 'Trusted oracles resolve markets automatically when the event concludes.',
  },
  {
    icon: Lock,
    title: 'Non-Custodial Escrow',
    body: 'InsightArena never holds your funds. Smart contracts lock stakes until resolution.',
  },
  {
    icon: Scale,
    title: 'Fair Outcomes',
    body: 'The protocol uses robust dispute resolution mechanisms to guarantee fairness.',
  },
  {
    icon: BarChart2,
    title: 'Analytics & Insights',
    body: 'Analyze historical data, market trends, and top player strategies to improve.',
  },
];

export default function FeatureGrid() {
  return (
    <section
      className="w-full py-20 px-6"
      style={{ background: '#0d1229' }}
      aria-labelledby="feature-grid-title"
    >
      <div className="max-w-5xl mx-auto">
        {/* Section title */}
        <motion.h2
          id="feature-grid-title"
          className="text-white font-bold text-center mb-12"
          style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.1rem)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Everything You Need to Compete On-Chain
        </motion.h2>

        {/* 3×2 grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
          }}
          role="list"
        >
          {features.map(({ icon: Icon, title, body }, index) => (
            <motion.article
              key={title}
              role="listitem"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <Card className="bg-[#121633] border border-white/10 rounded-xl hover:border-blue-500/50 transition-colors">
                <CardContent className="p-6 flex flex-col gap-3">
                  {/* Icon box */}
                  <div
                    aria-hidden="true"
                    className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0"
                  >
                    <Icon size={18} className="text-blue-500" strokeWidth={1.8} />
                  </div>

                  {/* Text */}
                  <h3 className="text-white font-bold text-sm">
                    {title}
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed m-0">
                    {body}
                  </p>
                </CardContent>
              </Card>
            </motion.article>
          ))}
        </div>
      </div>

      {/* Responsive: stack to 1 col on mobile, 2 col on tablet */}
      <style>{`
        @media (max-width: 768px) {
          #feature-grid-title + div {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          #feature-grid-title + div {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}