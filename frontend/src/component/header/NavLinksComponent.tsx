import Link from "next/link";
import { NAV_LINKS } from "./navLinks";

type NavLinksProps = {
  isActive: (path: string) => boolean;
};

export function NavLinks({ isActive }: NavLinksProps) {
  return (
    <div className="hidden md:flex items-center space-x-6">
      {NAV_LINKS.map((link) => {
        const active = isActive(link.link);

        return (
          <Link
            key={link.name}
            href={link.link}
            aria-current={active ? "page" : undefined}
            className={`relative transition-colors ${
              active ? "text-white font-semibold" : "text-gray-200 hover:text-white"
            }`}
          >
            {link.name}
            <span
              className={`absolute left-0 right-0 -bottom-1 h-0.5 bg-orange-500 transition-opacity ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </div>
  );
}

export default NavLinks;
