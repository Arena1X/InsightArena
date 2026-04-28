"use client";

import React from "react";
import { motion } from "framer-motion";
import { Users, Trophy, Clock } from "lucide-react";
import Image from "next/image";

interface FeaturedCardProps {
  image: string;
  tag: string;
  title: string;
  description: string;
  stats: {
    users: string;
    volume: string;
    time: string;
  };
  tagColor?: "purple" | "blue";
}

const FeaturedCard: React.FC<FeaturedCardProps> = ({
  image,
  tag,
  title,
  description,
  stats,
  tagColor = "purple",
}) => {
  const tagClass =
    tagColor === "purple"
      ? "bg-purple-600/90 text-white"
      : "bg-blue-600/90 text-white";

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-[#0f172a] border border-gray-800 rounded-2xl overflow-hidden flex flex-col h-full shadow-lg hover:shadow-cyan-500/10 transition-all duration-300"
    >
      {/* Top Image & Tag */}
      <div className="relative h-48 w-full overflow-hidden">
        <Image
          src={image}
          alt={title}
          fill
          className="object-cover transition-transform duration-500 hover:scale-105"
        />
        <div
          className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${tagClass}`}
        >
          {tag}
        </div>
      </div>

      {/* Card Content */}
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-white mb-2 leading-tight">
          {title}
        </h3>
        <p className="text-gray-400 text-sm mb-6 line-clamp-2">
          {description}
        </p>

        {/* Stats Row */}
        <div className="flex items-center justify-between mt-auto mb-6 text-gray-400">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium">{stats.users}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className="text-xs font-medium">{stats.volume}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium">{stats.time}</span>
          </div>
        </div>

        {/* Action Button */}
        <button className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold rounded-xl transition-colors duration-200">
          Join Here
        </button>
      </div>
    </motion.div>
  );
};

export default function FeaturedThisWeek() {
  const featuredEvents = [
    {
      image: "https://images.unsplash.com/photo-1611974708434-996e1393607a?auto=format&fit=crop&q=80&w=800",
      tag: "Trading Competition",
      title: "Elite Traders Championship",
      description: "Compete with the best traders globally and win a share of the massive prize pool in this high-stakes competition.",
      stats: { users: "24k", volume: "$80,000", time: "12:00h" },
      tagColor: "purple" as const,
    },
    {
      image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=800",
      tag: "Live Analysis",
      title: "Market Insights Summit",
      description: "Join top analysts for real-time market breakdown and discover hidden gems in the current crypto landscape.",
      stats: { users: "15k", volume: "$45,000", time: "08:00h" },
      tagColor: "blue" as const,
    },
    {
      image: "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?auto=format&fit=crop&q=80&w=800",
      tag: "DeFi Strategies",
      title: "Advanced DeFi Strategies",
      description: "Learn and implement complex yield farming and liquidity provision strategies to maximize your returns safely.",
      stats: { users: "18k", volume: "$120,000", time: "24:00h" },
      tagColor: "purple" as const,
    },
  ];

  return (
    <section className="py-20 px-6 relative overflow-hidden">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white inline-block relative">
              Featured This Week
              <span className="absolute -bottom-2 left-0 w-1/2 h-1 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full"></span>
            </h2>
          </motion.div>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredEvents.map((event, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <FeaturedCard {...event} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Background Decorative Element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 blur-[120px] rounded-full"></div>
      </div>
    </section>
  );
}
