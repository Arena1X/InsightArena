"use client";
import Button from '@/component/Button';
import { useState } from "react";
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { Github } from "lucide-react";
import PageBackground from "@/component/PageBackground";

const Login: NextPage = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle login submission logic here
    console.log("Login submitted:", formData);
  };

  return (
    <>
      <Head>
        <title>Login</title>
        <meta name="description" content="Login to your account" />
      </Head>
      <PageBackground>
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md p-6 space-y-8">
            {/* Progress Indicators */}
            <div className="flex justify-center space-x-4">
              <div className="w-16 h-1 bg-purple-600 rounded"></div>
              <div className="w-16 h-1 bg-purple-600 rounded"></div>
              <div className="w-16 h-1 bg-gray-600 rounded"></div>
              <div className="w-16 h-1 bg-gray-600 rounded"></div>
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Login Account</h1>
              <p className="mt-1 text-gray-400">
                Entre you date to create your account
              </p>
            </div>

            <div className="mt-8 space-y-6">
              {/* OAuth Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  aria-label="Continue with Google"
                  className="flex items-center justify-center w-full py-2 px-4 bg-purple-800 text-white rounded-md hover:bg-purple-700 transition"
                >
                  <img
                    src="/google-logo.svg"
                    alt="Google"
                    className="w-5 h-5 mr-2"
                  />
                  Google
                </button>
                <button
                  type="button"
                  aria-label="Continue with GitHub"
                  className="flex items-center justify-center w-full py-2 px-4 bg-purple-800 text-white rounded-md hover:bg-purple-700 transition"
                >
                  <Github className="w-5 h-5 mr-2" />
                  Git Hub
                </button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-transparent text-gray-400">or</span>
                </div>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-white mb-1"
                  >
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="john@example.com"
                    autoComplete="email"
                    className="w-full rounded border border-gray-600 bg-gray-700/60 p-2 text-white placeholder:text-gray-300"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-white mb-1"
                  >
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded border border-gray-600 bg-gray-700/60 p-2 text-white placeholder:text-gray-300"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Must be at least 8 character Long
                  </p>
                </div>

                <Button 
  type="submit" 
  variant="primary" 
  className="w-full"
>
  Login
</Button>
              </form>

              <div className="text-center mt-4">
                <p className="text-sm text-gray-400">
                  Already have an Account?{" "}
                  <Link
                    href="/signup"
                    className="text-purple-500 hover:text-purple-400"
                  >
                    Sign Up
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </main>
      </PageBackground>
    </>
  );
};

export default Login;
