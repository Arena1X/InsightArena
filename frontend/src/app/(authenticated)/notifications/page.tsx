"use client";

import NotificationsCard from "@/component/NotificationsCard";

export default function NotificationsPage() {
  return (
    <div className="max-w-3xl mx-auto p-4">
      <NotificationsCard />
      {/* Pagination placeholder */}
      <div className="flex justify-center mt-4">
        <button className="px-3 py-1 mx-1 text-gray-200 bg-gray-800 rounded hover:bg-gray-700">Previous</button>
        <button className="px-3 py-1 mx-1 text-gray-200 bg-gray-800 rounded hover:bg-gray-700">Next</button>
      </div>
    </div>
  );
}
