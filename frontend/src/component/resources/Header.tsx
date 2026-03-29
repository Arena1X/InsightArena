"use client";
import React, { useState } from "react";
import { Book, ChartLine, Gift, ScrollText, BellDot, Moon } from "lucide-react";
import Link from "next/link";

const Header = () => {
  const [selected, setSelected] = useState("Resources");

  const Navbar = [
    { name: "Courses", icon: <Book /> },
    { name: "Trading", icon: <ChartLine /> },
    { name: "Airdrops", icon: <Gift /> },
    { name: "Resources", icon: <ScrollText /> },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6">
      <div className="flex flex-wrap items-center justify-between border px-4 py-4 rounded-lg gap-10">
        <div className="text-[22px] sm:text-[26px] font-bold grow">
          <Link href="../../">Stark Academy</Link>
        </div>
        <div className="flex-none">
          <ul className="flex flex-wrap gap-6 sm:gap-10 items-center justify-center">
            {Navbar.map((item) => (
              <li
                key={item.name}
                className={`flex items-center gap-2 cursor-pointer transition-colors ${
                  selected === item.name
                    ? "text-white"
                    : "text-gray-600 hover:text-gray-800"
                }`}
                onClick={() => setSelected(item.name)}
              >
                {item.icon}
                <span>{item.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-6 sm:gap-10">
          <BellDot className="cursor-pointer" />
          <Moon className="cursor-pointer" />
          <Button className="bg-purple-600 text-white rounded-full p-2 border">
            PH
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;
