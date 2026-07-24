"use client";

import Link from "next/link";
import type { NextPage } from "next";

const Dashboard: NextPage = () => {
  return (
    <div className="flex flex-col items-center justify-center grow gap-6 px-5 py-24">
      <p className="text-xl m-0">Dashboard starts here</p>

      <Link href="/" className="btn btn-neutral">
        Back
      </Link>
    </div>
  );
};

export default Dashboard;
