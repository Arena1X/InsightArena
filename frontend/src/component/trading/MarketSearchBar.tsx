import React from "react";

interface MarketSearchBarProps {
  searchValue: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilterClick: () => void;
}

const SearchIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="9" cy="9" r="7" stroke="#A3A3A3" strokeWidth="2" />
    <path d="M15.5 15.5L13 13" stroke="#A3A3A3" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const FilterIcon = () => (
  <span
    className="inline-flex items-center justify-center w-6 h-6 bg-white rounded-full mr-2"
    aria-hidden="true"
  >
    <span className="text-black font-bold text-lg">i</span>
  </span>
);

const MarketSearchBar: React.FC<MarketSearchBarProps> = ({ searchValue, onSearchChange, onFilterClick }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-4 my-4 w-full">
      <div className="flex items-center border border-gray-500 rounded-xl px-4 h-[42px] w-full md:max-w-md bg-transparent">
        <label htmlFor="market-search" className="sr-only">
          Search tokens
        </label>
        <span className="mr-2"><SearchIcon /></span>
        <input
          id="market-search"
          type="text"
          placeholder="Search token"
          aria-label="Search tokens"
          value={searchValue}
          onChange={onSearchChange}
          className="bg-transparent outline-none border-none text-lg font-semibold text-gray-300 w-full placeholder:font-bold placeholder:text-gray-400"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Filter market tokens"
          onClick={onFilterClick}
          className="flex items-center border border-gray-500 rounded-xl px-4 h-[42px] font-bold text-white bg-transparent hover:border-white transition-all"
          style={{ minWidth: 0, width: 'auto', padding: '10px', gap: '10px' }}
        >
          <FilterIcon />
          All tokens
        </button>
        <button
          type="button"
          aria-label="Start trading"
          className="font-bold text-white rounded-xl px-4 h-[42px]"
          style={{ background: '#9747FF9E', border: '1px solid #9747FF9E', minWidth: 0, width: 'auto', padding: '10px', gap: '10px' }}
        >
          Start Trading
        </button>
      </div>
    </div>
  );
};

export default MarketSearchBar;
