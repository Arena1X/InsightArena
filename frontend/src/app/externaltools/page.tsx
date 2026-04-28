"use client";
import Header from "@/component/resources/Header";
import Footer from "@/component/resources/Footer";
import PageBackground from "@/component/PageBackground";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import Image from "next/image";

const Resources = () => {
  const [selected, setSelected] = useState("DEX Apps");
  const Menubar = [
    { id: 1, name: "DEX Apps" },
    { id: 2, name: "Defi Platform" },
    { id: 3, name: "Stake Sites" },
    { id: 4, name: "Wallets" },
  ];

  const Apps = [
    {
      name: "UniSwap",
      description:
        "A popular decentralized exchange protocol on Ethereum that uses automated market maker (AMM) model.",
      image: "",
      link: "https://app.uniswap.org/",
    },
    {
      name: "PancakeSwap",
      description:
        "A decentralized exchange on BNB Chain (formerly Binance Smart Chain) with lower fees than Ethereum-based DEXes.",
      image: "",
      link: "https://pancakeswap.finance/",
    },
    {
      name: "dYdX",
      description:
        "A decentralized exchange for cryptocurreny derivatives, offering perpetual contracts with upto 20x leverage.",
      image: "",
      link: "https://www.dydx.xyz/",
    },
    {
      name: "SushiSwap",
      description:
        "A community-driven DEX and part of a larger DeFi ecosystem that includes lending and yield farming.",
      image: "",
      link: "https://www.sushi.com/ethereum/swap",
    },
  ];

  return (
    <PageBackground>
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex-1">
          <div className="px-6 pt-24 sm:px-14">
            <h1 className="py-4 text-[28px] font-bold text-white">Resources</h1>
            <p className="pb-4 text-[12px] text-gray-300">
              Explore Curated Links To Essential Web3 Tools, Platforms, And
              Services
            </p>
          </div>
          <div className="px-6 py-4 sm:px-14">
            <ul className="flex w-max gap-1 rounded-lg bg-neutral-400 p-2">
              {Menubar.map((item) => (
                <li
                  key={item.id}
                  onClick={() => setSelected(item.name)}
                  className={`cursor-pointer rounded-xl ${
                    selected === item.name ? "bg-black" : "bg-neutral-500"
                  }`}
                >
                  <h1
                    className={`flex items-center px-6 py-1 text-[14px] ${
                      selected === item.name
                        ? "text-white"
                        : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {item.name}
                  </h1>
                </li>
              ))}
            </ul>
          </div>
          <div>
            {selected === "DEX Apps" && (
              <div className="p-6">
                <div className="h-fit w-full rounded-xl border border-amber-50/40 bg-black/20 py-6 px-8">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {Apps.map((item) => (
                      <div
                        key={item.name}
                        className="w-full rounded-xl border border-amber-50/40 bg-black/20 p-4"
                      >
                        <div className="flex items-start gap-3 pb-6">
                          <div>
                            {item.image == "" ? (
                              <div className="size-11 rounded-lg bg-amber-50"></div>
                            ) : (
                              <Image src={item.image} alt="img" />
                            )}
                          </div>
                          <div className="text-[22px] font-bold text-white">
                            {item.name}
                          </div>
                        </div>
                        <div className="text-[16px] text-gray-200">
                          {item.description}
                        </div>
                        <div className="pt-6">
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[14px] text-white hover:bg-white/10"
                          >
                            View {item.name}
                            <ExternalLink className="size-5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="py-10">
                      <p className="text-center text-[14px] text-gray-300">
                        These Resources Are Provided For Educational Purposes.
                        Always Do Your Own Research Before Using Any Web3
                        Platform.
                      </p>
                    </div>
                    <div className="flex items-center justify-center pb-4">
                      <button className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-[14px] text-white hover:bg-white/10 sm:w-[30%]">
                        Learn More In Our Courses
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </PageBackground>
  );
};

export default Resources;
