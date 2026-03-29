"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Send, MessageSquare, Twitter, Github } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";
import {
  FormInput,
  FormTextarea,
  FormSelect,
  SubmitButton,
  FormSuccessBanner,
  FormErrorBanner,
} from "@/component/FormField";
import {
  contactSchema,
  type ContactFormData,
  CONTACT_CATEGORIES,
} from "@/lib/validations";

const SOCIAL_LINKS = [
  { label: "Telegram", href: "https://t.me/+hR9dZKau8f84YTk0", icon: MessageSquare },
  { label: "Twitter", href: "https://twitter.com/InsightArena", icon: Twitter },
  { label: "GitHub", href: "https://github.com/Arena1X", icon: Github },
];

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { category: "Technical" },
    mode: "onTouched",
  });

  const onSubmit = async (data: ContactFormData) => {
    try {
      // Simulate API call — replace with real endpoint
      await new Promise((r) => setTimeout(r, 1200));
      console.log("Contact submitted:", data);
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  };

  return (
    <PageBackground>
      <Header />

      <main className="max-w-5xl mx-auto px-4 pt-32 pb-20 sm:px-6 text-white">
        {/* Header card */}
        <section className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-6 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:p-10">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#4FD1C5]">
                Support
              </p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Contact Us
              </h1>
              <p className="max-w-2xl text-base text-[#94a3b8]">
                Have a question or issue? Fill out the form below and we&apos;ll
                get back to you as soon as possible.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#d8dee9] transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={18} />
              Back to home
            </Link>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            {/* ── Form ── */}
            <div className="lg:col-span-2">
              {status === "success" ? (
                <FormSuccessBanner
                  title="Message Sent!"
                  message="Thanks for reaching out. We typically respond within 24–48 hours."
                  onReset={() => setStatus("idle")}
                  resetLabel="Send another message"
                />
              ) : status === "error" ? (
                <FormErrorBanner
                  message="Please try again or reach us directly via social media."
                  onRetry={() => setStatus("idle")}
                />
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormInput
                      id="contact-name"
                      label="Name"
                      type="text"
                      placeholder="Your name"
                      required
                      error={errors.name?.message}
                      {...register("name")}
                    />
                    <FormInput
                      id="contact-email"
                      label="Email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      error={errors.email?.message}
                      {...register("email")}
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormSelect
                      id="contact-category"
                      label="Category"
                      options={CONTACT_CATEGORIES}
                      error={errors.category?.message}
                      {...register("category")}
                    />
                    <FormInput
                      id="contact-subject"
                      label="Subject"
                      type="text"
                      placeholder="Brief summary"
                      required
                      error={errors.subject?.message}
                      {...register("subject")}
                    />
                  </div>

                  <FormTextarea
                    id="contact-message"
                    label="Message"
                    rows={5}
                    placeholder="Describe your issue or question in detail…"
                    required
                    error={errors.message?.message}
                    {...register("message")}
                  />

                  <SubmitButton
                    loading={isSubmitting}
                    label="Send Message"
                    loadingLabel="Sending…"
                    className="sm:w-auto gap-2"
                  />
                </form>
              )}
            </div>

            {/* ── Sidebar ── */}
            <div className="space-y-5">
              {/* Response times */}
              <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#4FD1C5]">
                  Response Times
                </h3>
                <ul className="space-y-2 text-sm text-[#94a3b8]">
                  {[
                    { cat: "Technical", time: "24–48 hrs" },
                    { cat: "Account", time: "12–24 hrs" },
                    { cat: "Trading", time: "24–48 hrs" },
                    { cat: "Other", time: "48–72 hrs" },
                  ].map(({ cat, time }) => (
                    <li key={cat} className="flex justify-between">
                      <span>{cat}</span>
                      <span className="text-white">{time}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* FAQ link */}
              <div className="rounded-2xl border border-[#4FD1C5]/20 bg-[#0b1220] p-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#4FD1C5]">
                  Quick Answers
                </h3>
                <p className="mb-3 text-sm text-[#94a3b8]">
                  Many common questions are already answered in our FAQ.
                </p>
                <Link
                  href="/Faq"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#4FD1C5]/30 px-4 py-2 text-sm font-medium text-[#4FD1C5] transition hover:bg-[#4FD1C5]/10"
                >
                  Browse FAQ →
                </Link>
              </div>

              {/* Social links */}
              <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#4FD1C5]">
                  Find Us Online
                </h3>
                <div className="flex flex-col gap-2">
                  {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-[#cbd5e1] transition hover:border-[#4FD1C5]/40 hover:text-white"
                    >
                      <Icon size={16} className="text-[#4FD1C5]" />
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </PageBackground>
  );
}
