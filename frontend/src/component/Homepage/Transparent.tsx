import { Card, CardContent } from "@/component/ui/card";
import { motion } from "framer-motion";
import {
  FaFileContract,
  FaGlobe,
  FaLock,
  FaShieldHalved,
} from "react-icons/fa6";

const features = [
  {
    icon: FaLock,
    title: "On-Chain Escrow",
    body: "All stakes are locked in transparent Stellar smart contracts ensuring solvency.",
  },
  {
    icon: FaShieldHalved,
    title: "Immutable Records",
    body: "Your predictions, wins, and losses are permanently logged on the Stellar ledger.",
  },
  {
    icon: FaFileContract,
    title: "Smart Contract Security",
    body: "Audited Rust (Soroban) smart contracts govern all protocol logic and mechanics.",
  },
  {
    icon: FaGlobe,
    title: "Public Verification",
    body: "Anyone can independently verify market resolution and payout distribution logic.",
  },
];

export default function TransparentGrid() {
  return (
    <section
      className="w-full py-20 px-6"
      aria-labelledby="transparent-grid-title"
    >
      <div className="max-w-5xl mx-auto">
        {/* Section title */}
        <motion.div
          className="text-center space-y-4 mb-20 relative z-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
            Transparent by Design
          </h2>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Trust in mathematics and code. Every action on InsightArena is
            publicly verifiable, completely transparent, and executed by
            immutable smart contracts on the Stellar network.
          </p>
        </motion.div>

        {/* 3×2 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "1rem",
          }}
          role="list"
          id="transparent-grid-title"
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
              <Card className="bg-gray-950/60 border border-white/10 rounded-xl hover:border-orange-500/50 transition-colors">
                <CardContent className="p-6 flex flex-col gap-3">
                  {/* Icon box */}
                  <div
                    aria-hidden="true"
                    className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0"
                  >
                    <Icon size={18} className="text-orange-400" />
                  </div>

                  {/* Text */}
                  <h3 className="text-white font-bold text-sm">{title}</h3>
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
          #transparent-grid-title {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          #transparent-grid-title {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
