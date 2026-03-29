"use client";

import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Github } from "lucide-react";

import PageBackground from "@/component/PageBackground";
import {
  FormInput,
  SubmitButton,
  FormSuccessBanner,
  FormErrorBanner,
} from "@/component/FormField";
import { loginSchema, type LoginFormData } from "@/lib/validations";

const Login: NextPage = () => {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      // Simulate API call — replace with real auth logic
      await new Promise((r) => setTimeout(r, 1200));
      console.log("Login submitted:", data);
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <Head>
        <title>Login | InsightArena</title>
        <meta name="description" content="Login to your InsightArena account" />
      </Head>
      <PageBackground>
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md p-6 space-y-8">
            {/* Progress Indicators */}
            <div className="flex justify-center space-x-4">
              <div className="w-16 h-1 bg-purple-600 rounded" />
              <div className="w-16 h-1 bg-purple-600 rounded" />
              <div className="w-16 h-1 bg-gray-600 rounded" />
              <div className="w-16 h-1 bg-gray-600 rounded" />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Login Account</h1>
              <p className="mt-1 text-gray-400">
                Enter your details to access your account
              </p>
            </div>

            {status === "success" ? (
              <FormSuccessBanner
                title="Welcome back!"
                message="You have successfully logged in to InsightArena."
                onReset={() => setStatus("idle")}
                resetLabel="Login again"
              />
            ) : status === "error" ? (
              <FormErrorBanner
                message="Login failed. Please check your credentials and try again."
                onRetry={() => setStatus("idle")}
              />
            ) : (
              <div className="space-y-6">
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
                    GitHub
                  </button>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-transparent text-gray-400">or</span>
                  </div>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                  <FormInput
                    id="email"
                    label="Email"
                    type="email"
                    placeholder="john@example.com"
                    autoComplete="email"
                    required
                    error={errors.email?.message}
                    {...register("email")}
                  />

                  <FormInput
                    id="password"
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    error={errors.password?.message}
                    {...register("password")}
                  />

                  <SubmitButton
                    loading={isSubmitting}
                    label="Login"
                    loadingLabel="Logging in…"
                    className="mt-6 bg-purple-700 hover:bg-purple-600 focus:ring-purple-500 text-white"
                  />
                </form>

                <div className="text-center">
                  <p className="text-sm text-gray-400">
                    Don&apos;t have an account?{" "}
                    <Link
                      href="/signin"
                      className="text-purple-500 hover:text-purple-400 font-medium"
                    >
                      Sign Up
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </PageBackground>
    </>
  );
};

export default Login;
