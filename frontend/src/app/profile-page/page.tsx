import Image from "next/image"
import Link from "next/link"
import { Badge } from "@/component/ui/badge"
import { Button } from "@/component/ui/button"
import { Card, CardContent } from "@/component/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/component/ui/tabs"
import { ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Moon, Shield } from "lucide-react"

export default function CoursePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Stark Academy
          </Link>
          <nav className="hidden md:flex items-center space-x-6">
            <div className="flex items-center">
              <FileText className="mr-2 h-4 w-4" />
              <span>Courses</span>
              <ChevronDown className="ml-1 h-4 w-4" />
            </div>
            <div className="flex items-center">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 22V12H15V22"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Trading</span>
            </div>
            <div className="flex items-center">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Airdrops</span>
            </div>
            <div className="flex items-center">
              <Shield className="mr-2 h-4 w-4" />
              <span>Resources</span>
            </div>
          </nav>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="rounded-full">
              <Moon className="h-5 w-5" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center">
              <span className="text-sm font-medium">PH</span>
            </div>
            <Button variant="ghost" size="icon" className="md:hidden">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Sidebar */}
          <div className="hidden lg:col-span-2 lg:block">
            <div className="flex flex-col items-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-purple-600">
                <Image
                  src="/placeholder.svg?height=96&width=96"
                  alt="User avatar"
                  width={96}
                  height={96}
                  className="object-cover"
                />
              </div>
              <Link
                href="/profile"
                className="mt-4 w-full border-purple-800 bg-zinc-900 text-white hover:bg-zinc-800 flex items-center justify-center rounded-md border px-4 py-2 transition"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                View Profile
              </Link>
              <Button
                variant="outline"
                className="mt-2 w-full border-purple-800 bg-zinc-900 text-white hover:bg-zinc-800"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M19.5 12.5719L12 19.9999L4.5 12.5719C4.0053 12.0772 3.61534 11.4879 3.35462 10.8394C3.0939 10.191 2.96933 9.4964 2.98768 8.79862C3.00603 8.10083 3.16682 7.41407 3.46133 6.78053C3.75584 6.14699 4.17766 5.58359 4.7 5.12186C5.22235 4.66013 5.83431 4.30784 6.49709 4.08882C7.15987 3.8698 7.85908 3.78967 8.55455 3.85321C9.25002 3.91674 9.92089 4.12239 10.5222 4.45929C11.1235 4.79618 11.6428 5.25526 12.04 5.80586C12.4371 5.25526 12.9565 4.79618 13.5578 4.45929C14.1591 4.12239 14.83 3.91674 15.5254 3.85321C16.2209 3.78967 16.9201 3.8698 17.5829 4.08882C18.2457 4.30784 18.8576 4.66013 19.38 5.12186C19.9023 5.58359 20.3242 6.14699 20.6187 6.78053C20.9132 7.41407 21.074 8.10083 21.0923 8.79862C21.1107 9.4964 20.9861 10.191 20.7254 10.8394C20.4647 11.4879 20.0747 12.0772 19.58 12.5719H19.5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                NFT Badges
              </Button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-7">
            <div className="mb-6">
              <Button variant="ghost" className="mb-4 flex items-center text-zinc-400 hover:text-white">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to courses
              </Button>
              <h1 className="mb-4 text-3xl font-bold">What is crypto?</h1>
              <p className="text-zinc-400">
                Learn The Core Concepts Of Blockchain Technology, Including Distributed Ledgers, Consensus Mechanisms,
                And Cryptography.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Badge variant="outline" className="rounded-full bg-zinc-900 text-zinc-400">
                  Beginner
                </Badge>
                <div className="flex items-center text-zinc-400">
                  <Clock className="mr-1 h-4 w-4" />
                  <span>30min</span>
                </div>
                <div className="flex items-center text-zinc-400">
                  <FileText className="mr-1 h-4 w-4" />
                  <span>4 Lessons</span>
                </div>
              </div>
            </div>

            <Tabs defaultValue="lesson" className="mb-8">
              <TabsList className="bg-zinc-900">
                <TabsTrigger value="lesson" className="data-[state=active]:bg-purple-900">
                  Lesson Content
                </TabsTrigger>
                <TabsTrigger value="resources" className="data-[state=active]:bg-purple-900">
                  Resources
                </TabsTrigger>
              </TabsList>
              <TabsContent value="lesson" className="mt-6">
                <div className="space-y-6">
                  <div>
                    <h2 className="mb-2 text-xl font-semibold">Introduction to Crypto</h2>
                    <p className="text-zinc-400">
                      Understanding The Basics Of Blockchain Technology And Its Potential Applications.
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-300">
                      Cryptocurrency Is A Digital Form Of Money That Uses Blockchain Technology And Encryption To Secure
                      Transactions. Bitcoin, Ethereum, And Starknet Are Popular Examples. Unlike Traditional Currencies,
                      It's Not Controlled By A Central Authority.
                    </p>
                  </div>
                  <div className="flex justify-between pt-4">
                    <Button variant="outline" className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                      Previous Lesson
                    </Button>
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      Next Lesson
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="resources" className="mt-6">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-medium">Additional Resources</h3>
                  <ul className="list-inside list-disc space-y-2 text-zinc-400">
                    <li>Blockchain Technology Whitepaper</li>
                    <li>Cryptocurrency Market Analysis</li>
                    <li>Smart Contract Development Guide</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>

            <Card className="border-zinc-800 bg-zinc-900">
              <CardContent className="p-6">
                <div className="flex flex-col items-center">
                  <Badge className="mb-2 bg-zinc-800 px-2 py-1 text-xs text-zinc-400">1</Badge>
                  <h3 className="mb-4 text-center text-xl font-bold">NFT BADGE</h3>
                  <div className="mb-4 h-24 w-24 overflow-hidden rounded-full border-4 border-zinc-700">
                    <div className="h-full w-full bg-gradient-to-br from-blue-500 to-purple-600 p-4">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-full w-full text-white"
                      >
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path
                          d="M8 12L11 15L16 10"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <Button className="mt-2 bg-purple-600 hover:bg-purple-700">Claim Your Badge</Button>
                </div>
              </CardContent>
            </Card>

            <div className="mt-8 text-center text-sm text-zinc-500">
              <p>It takes you to this point</p>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium">Course Progress</h3>
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-zinc-400">Over All Progress</span>
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-zinc-800">
                  <span className="text-lg font-bold">0%</span>
                </div>
              </div>
              {/* <Progress value={0} className="h-1 bg-zinc-800" indicatorClassName="bg-purple-600" /> */}

              <div className="mt-8">
                <h3 className="mb-4 text-lg font-medium">Course Content</h3>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((index) => (
                    <div
                      key={index}
                      className="flex gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 hover:bg-zinc-900"
                    >
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-medium">
                        {index}
                      </div>
                      <div>
                        <h4 className="font-medium text-purple-400">Introduction to Crypto</h4>
                        <p className="text-xs text-zinc-400">
                          Understanding The Basics Of Blockchain Technology And Its Potential Applications.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
