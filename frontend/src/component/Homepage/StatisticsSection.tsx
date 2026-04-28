import { motion } from "framer-motion";
import { Sparkles, LineChart, Users, Wallet } from "lucide-react";

const stats = [
  { value: "$2.4M", label: "Total Volume", icon: Wallet },
  { value: "847", label: "Active Markets", icon: Users },
  { value: "12.5K", label: "Total Predictions", icon: LineChart },
  { value: "234", label: "Current Creators", icon: Sparkles },
];

export default function StatisticsSection() {
  return (
    <section
      className="relative py-16 md:py-24 px-6"
      style={{ background: "none" }}
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center space-y-4 mb-10 md:mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            Compete for Real Rewards
          </h2>
          <p className="text-gray-300 text-base sm:text-lg max-w-3xl mx-auto">
            Join thousands of players predicting the future and earning natively
            on Stellar.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              viewport={{ once: true }}
              className="bg-gray-950/60 border border-[#1e2d45] rounded-xl px-8 py-7 flex flex-col min-h-[140px] justify-center items-center text-center gap-2"
            >
              <stat.icon className="w-6 h-6 text-orange-400" />
              <div className="text-3xl font-bold text-orange-400">
                {stat.value}
              </div>
              <div className="text-gray-400 text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
