"use client";
import Button from '@/components/Button';
import Header from "@/component/resources/Header";
import Footer from "@/component/resources/Footer";
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
    <div>
      <Header />
      <div>
        <div className="px-14">
          <h1 className="py-4 text-[28px] font-bold">Resources</h1>
          <p className="pb-4 text-[12px]">
            Explore Curated Links To Essential Web3 Tools, Platforms, And
            Services
          </p>
        </div>
        <div className="px-14 py-4">
          <ul className="flex bg-neutral-400 w-max p-2 gap-1 rounded-lg">
            {Menubar.map((item) => (
              <li
                key={item.id}
                onClick={() => setSelected(item.name)}
                className={`rounded-xl cursor-pointer ${
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
              <div className="border rounded-xl border-amber-50 w-full h-fit py-6 px-8">
                <div className="grid grid-cols-2 gap-4">
                  {Apps.map((item) => (
                    <div
                      key={item.name}
                      className="border border-amber-50 w-fit p-2 rounded-xl"
                    >
                      <div className="flex pb-10 gap-2">
                        <div>
                          {item.image == "" ? (
                            <div className="size-11 rounded-lg bg-amber-50"></div>
                          ) : (
                            <Image src={item.image} alt="img" />
                          )}
                        </div>
                        <div className="text-[26px] font-bold">{item.name}</div>
                      </div>
                      <div className="text-[18px] px-12 pb-4">
                        {item.description}
                      </div>
                      <div className="py-6 px-2">
                        <Button className="cursor-pointer border w-full rounded-lg py-1">
                          <a
                            href={item.link}
                            target="_blank"
                            className="flex items-center justify-center text-[14px]"
                          >
                            View {item.name}
                            <ExternalLink className="size-5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="py-10">
                    <p className="text-center text-[14px]">
                      These Resources Are Provided For Educational Purposes.
                      Always Do Your Own Research Before Using Any Web3
                      Platform.
                    </p>
                  </div>
                  <div className="flex items-center justify-center pb-4">
                    <Button className="underline border w-[30%] rounded-lg py-1 text-[14px]">
                      Learn More In Our Courses
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Resources;
