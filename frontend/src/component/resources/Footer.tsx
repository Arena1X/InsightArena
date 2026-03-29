import { Twitter, Instagram, Github } from "lucide-react";
import Button from '@/components/Button';
const Footer = () => {
  return (
    <div className="pt-8">
      <div className="grid grid-cols-2 px-14 pb-4">
        <div>
          <div className="w-fit text-center">
            <h1 className="text-[32px] font-bold bg-gradient-to-r from-purple-500 to-white bg-clip-text text-transparent pb-1">
              Stark Academy
            </h1>
            <p className="font-bold text-[14px]">
              Interactive Web3 Learning Platform With NFT Rewards
            </p>
          </div>
          <div className="px-4">
            <div className="pt-14 w-[50%] text-center">
              <h1 className="text-[18px] leading-6.5">
                Connect with our team to get started with your growth
              </h1>
              <div className="pt-2 pb-8">
                <a href="https://t.me/+wG8gxRxwrzQxNTk0" target="_blank">
                  <Button className="border-2 bg-gradient-to-r from-purple-500 to-blue-400 w-[90%] py-2 rounded-2xl cursor-pointer">
                    Join Telegram Group
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-12 px-8">
          <div>
            <h1 className="text-[16px] font-bold pb-2">Platform</h1>
            <p className="text-[14px] pb-1">Features</p>
            <p className="text-[14px] pb-1">Courses</p>
            <p className="text-[14px] pb-1">Resources</p>
            <p className="text-[14px] pb-1">Tournament</p>
            <p className="text-[14px] pb-1">Community Course</p>
          </div>
          <div>
            <h1 className="text-[16px] font-bold pb-2">Resources</h1>
            <p className="text-[14px] pb-1">DEX Apps</p>
            <p className="text-[14px] pb-1">DeFi Platforms</p>
            <p className="text-[14px] pb-1">Staking Sites</p>
          </div>
          <div className="text-center">
            <h1 className="text-[16px] font-bold pb-2">Connect</h1>
            <div className="flex gap-4">
              <Twitter />
              <Github />
              <Instagram />
            </div>
          </div>
        </div>
      </div>
      <hr />
      <div className="flex justify-between px-24 pt-6 pb-18">
        <div className="text-[14px]">
          @2025 Stark Academy. All Right Reserved
        </div>
        <div className="flex gap-6 px-14">
          <h1 className="text-[14px] font-bold">Terms</h1>
          <h1 className="text-[14px] font-bold">Policy</h1>
        </div>
      </div>
    </div>
  );
};

export default Footer;
