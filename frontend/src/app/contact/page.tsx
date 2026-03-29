"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Send, CheckCircle, AlertCircle, MessageSquare, Twitter, Github } from "lucide-react";
import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";

const CATEGORIES = ["Technical", "Account", "Trading", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

interface FormState {
  name: string;
  email: string;
  subject: string;
  category: Category;
  message: string;
}

const INITIAL: FormState = { name: "", email: "", subject: "", category: "Technical", message: "" };

const SOCIAL_LINKS = [
  { label: "Telegram", href: "https://t.me/+hR9dZKau8f84YTk0", icon: MessageSquare },
  { label: "Twitter", href: "https://twitter.com/InsightArena", icon: Twitter },
  { label: "GitHub", href: "https://github.com/Arena1X", icon: Github },
];

export default function ContactPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const e: Partial<FormState> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email address";
    if (!form.subject.trim()) e.subject = "Subject is required";
    if (!form.message.trim()) e.message = "Message is required";
    else if (form.message.trim().length < 20) e.message = "Message must be at least 20 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    // Simulate submission — replace with real API call
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    // Randomly succeed for demo; swap with real error handling
    setStatus("success");
    setForm(INITIAL);
    setErrors({});
  }

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  const inputCls = (key: keyof FormState) =>
    `w-full rounded-xl border bg-[#0f172a]/80 px-4 py-3 text-sm text-white placeholder-[#475569] outline-none transition focus:ring-2 focus:ring-[#4FD1C5]/60 ${
      errors[key] ? "border-red-500/60" : "border-white/10 focus:border-[#4FD1C5]/40"
    }`;

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <PageBackground />

      <div className="relative z-10">
        <Header />

        <main className="max-w-5xl mx-auto px-4 pt-32 pb-20 sm:px-6">
          {/* Header card */}
          <section className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-6 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:p-10">
            <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#4FD1C5]">Support</p>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Contact Us</h1>
                <p className="max-w-2xl text-base text-[#94a3b8]">
                  Have a question or issue? Fill out the form below and we'll get back to you as soon as possible.
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
              {/* Form */}
              <div className="lg:col-span-2">
                {status === "success" ? (
                  <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#4FD1C5]/20 bg-[#0b1220] px-6 py-12 text-center">
                    <CheckCircle size={48} className="text-[#4FD1C5]" />
                    <h2 className="text-xl font-semibold">Message Sent!</h2>
                    <p className="text-[#94a3b8]">
                      Thanks for reaching out. We typically respond within 24–48 hours.
                    </p>
                    <button
                      onClick={() => setStatus("idle")}
                      className="mt-2 rounded-xl bg-[#4FD1C5] px-6 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:bg-[#38b2ac]"
                    >
                      Send another message
                    </button>
                  </div>
                ) : status === "error" ? (
                  <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/20 bg-[#0b1220] px-6 py-12 text-center">
                    <AlertCircle size={48} className="text-red-400" />
                    <h2 className="text-xl font-semibold">Something went wrong</h2>
                    <p className="text-[#94a3b8]">Please try again or reach us directly via social media.</p>
                    <button
                      onClick={() => setStatus("idle")}
                      className="mt-2 rounded-xl bg-red-500/20 px-6 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/30"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#cbd5e1]">Name</label>
                        <input
                          type="text"
                          placeholder="Your name"
                          className={inputCls("name")}
                          {...field("name")}
                        />
                        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#cbd5e1]">Email</label>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          className={inputCls("email")}
                          {...field("email")}
                        />
                        {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#cbd5e1]">Category</label>
                        <select className={inputCls("category")} {...field("category")}>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c} className="bg-[#0f172a]">
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#cbd5e1]">Subject</label>
                        <input
                          type="text"
                          placeholder="Brief summary"
                          className={inputCls("subject")}
                          {...field("subject")}
                        />
                        {errors.subject && <p className="mt-1 text-xs text-red-400">{errors.subject}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#cbd5e1]">Message</label>
                      <textarea
                        rows={5}
                        placeholder="Describe your issue or question in detail…"
                        className={`${inputCls("message")} resize-none`}
                        {...field("message")}
                      />
                      {errors.message && <p className="mt-1 text-xs text-red-400">{errors.message}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4FD1C5] px-6 py-3 text-sm font-semibold text-[#0f172a] transition hover:bg-[#38b2ac] disabled:opacity-60 sm:w-auto"
                    >
                      {loading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f172a] border-t-transparent" />
                      ) : (
                        <Send size={16} />
                      )}
                      {loading ? "Sending…" : "Send Message"}
                    </button>
                  </form>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* Response time */}
                <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 p-5">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#4FD1C5]">
                    Response Times
                  </h3>
                  <ul className="space-y-2 text-sm text-[#94a3b8]">
                    <li className="flex justify-between">
                      <span>Technical</span>
                      <span className="text-white">24–48 hrs</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Account</span>
                      <span className="text-white">12–24 hrs</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Trading</span>
                      <span className="text-white">24–48 hrs</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Other</span>
                      <span className="text-white">48–72 hrs</span>
                    </li>
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
      </div>
    </div>
  );
}
