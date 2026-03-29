"use client";

import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
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
import { signupSchema, type SignupFormData } from "@/lib/validations";

const SignUp: NextPage = () => {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: "onTouched",
  });

  const passwordValue = watch("password");

  const onSubmit = async (data: SignupFormData) => {
    try {
      // Simulate API call — replace with real registration logic
      await new Promise((r) => setTimeout(r, 1200));
      console.log("Sign up submitted:", data);
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  };

  // Password strength indicator
  const getPasswordStrength = (pw: string) => {
    if (!pw) return null;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "w-1/4" };
    if (score === 2) return { label: "Fair", color: "bg-yellow-500", width: "w-2/4" };
    if (score === 3) return { label: "Good", color: "bg-blue-500", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full" };
  };

  const strength = getPasswordStrength(passwordValue ?? "");

  return (
    <>
      <Head>
        <title>Sign Up | InsightArena</title>
        <meta name="description" content="Create your InsightArena account" />
      </Head>
      <PageBackground>
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <div className="w-full max-w-md p-6 space-y-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Create Account</h1>
              <p className="mt-1 text-gray-400">
                Join InsightArena — it&apos;s free
              </p>
            </div>

            {status === "success" ? (
              <FormSuccessBanner
                title="Account Created!"
                message="Welcome to InsightArena. You can now log in with your credentials."
                onReset={() => setStatus("idle")}
                resetLabel="Sign up another account"
              />
            ) : status === "error" ? (
              <FormErrorBanner
                message="Registration failed. Please try again or use a different email."
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
                    <Image
                      src="/google-logo.svg"
                      alt="Google"
                      width={20}
                      height={20}
                      className="mr-2"
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

                {/* Sign Up Form */}
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput
                      id="firstName"
                      label="First Name"
                      type="text"
                      placeholder="John"
                      autoComplete="given-name"
                      required
                      error={errors.firstName?.message}
                      {...register("firstName")}
                    />
                    <FormInput
                      id="lastName"
                      label="Last Name"
                      type="text"
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                      error={errors.lastName?.message}
                      {...register("lastName")}
                    />
                  </div>

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

                  <div>
                    <FormInput
                      id="password"
                      label="Password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      error={errors.password?.message}
                      {...register("password")}
                    />
                    {/* Password strength bar */}
                    {passwordValue && strength && (
                      <div className="mt-2 space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-white/10">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${strength.color} ${strength.width}`}
                          />
                        </div>
                        <p className="text-xs text-[#94a3b8]">
                          Strength:{" "}
                          <span
                            className={
                              strength.label === "Strong"
                                ? "text-emerald-400"
                                : strength.label === "Good"
                                ? "text-blue-400"
                                : strength.label === "Fair"
                                ? "text-yellow-400"
                                : "text-red-400"
                            }
                          >
                            {strength.label}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  <FormInput
                    id="confirmPassword"
                    label="Confirm Password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    error={errors.confirmPassword?.message}
                    {...register("confirmPassword")}
                  />

                  <SubmitButton
                    loading={isSubmitting}
                    label="Create Account"
                    loadingLabel="Creating account…"
                    className="mt-6 bg-purple-700 hover:bg-purple-600 text-white"
                  />
                </form>

                <div className="text-center">
                  <p className="text-sm text-gray-400">
                    Already have an account?{" "}
                    <Link
                      href="/login"
                      className="text-purple-500 hover:text-purple-400 font-medium"
                    >
                      Log in
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

export default SignUp;
