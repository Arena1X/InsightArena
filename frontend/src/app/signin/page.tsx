"use client"
import { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Github } from 'lucide-react';

const SignUp: NextPage = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
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
    // Handle form submission logic here
    console.log('Form submitted:', formData);
  };

  return (
    <>
      <Head>
        <title>Sign Up</title>
        <meta name="description" content="Create your account" />
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="w-full max-w-md p-6 space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Sign Up Account</h1>
            <p className="mt-1 text-gray-400">Entre you date to create your account</p>
          </div>

          <div className="mt-8 space-y-6">
            {/* OAuth Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                aria-label="Continue with Google"
                className="flex items-center justify-center w-full py-2 px-4 bg-purple-800 text-white rounded-md hover:bg-purple-700 transition"
              >
                <Image src="/google-logo.svg" alt="Google" width={20} height={20} className="mr-2" />
                Google
              </button>
              <button
                type="button"
                aria-label="Continue with GitHub"
                className="flex items-center justify-center w-full py-2 px-4 bg-purple-800 text-white rounded-md hover:bg-purple-700 transition"
              >
                <Github className="w-5 h-5 mr-2" />
                GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-black text-gray-400">or</span>
              </div>
            </div>

            {/* Sign Up Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-white mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    placeholder="Ex: John"
                    autoComplete="given-name"
                    className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-white placeholder:text-gray-300"
                    value={formData.firstName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-white mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    placeholder="Ex: John"
                    autoComplete="family-name"
                    className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-white placeholder:text-gray-300"
                    value={formData.lastName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="john@example.com"
                  autoComplete="email"
                  className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-white placeholder:text-gray-300"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-white mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-white placeholder:text-gray-300"
                  value={formData.password}
                  onChange={handleChange}
                />
                <p className="mt-1 text-xs text-gray-400">Must be at least 8 character Long</p>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-600 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 mt-6"
              >
                Sign Up
              </button>
            </form>

            <div className="text-center mt-4">
              <p className="text-sm text-gray-400">
                Already have an Account?{' '}
                <Link href="/login" className="text-purple-500 hover:text-purple-400">
                  Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default SignUp;
