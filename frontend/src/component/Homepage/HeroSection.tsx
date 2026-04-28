import Image from "next/image";
import UnifiedBackground from "./UnifiedBackground";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Particle Effects Only for Hero */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 opacity-60">
          <UnifiedBackground
            variant="minimal"
            showParticles={true}
            particleCount={300}
            opacity={1}
            className="bg-transparent"
          />
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 lg:pt-40 pb-5">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 text-center lg:text-left">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                Predict Smarter. Compete Fairly.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
                  Earn On-Chain.
                </span>
              </h1>

              <p className="text-xl text-gray-300 max-w-lg mx-auto lg:mx-0">
                Join the premier decentralized prediction market on Stellar and
                put your insight to work.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
                Explore Markets
              </button>
              <button className="border border-gray-600 hover:border-gray-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
                Read the Docs
              </button>
            </div>
          </div>

          <div className="relative">
            <Image
              src="/block.png"
              height={700}
              width={700}
              alt="Description"
              className="rounded-2xl shadow-2xl mx-auto"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
