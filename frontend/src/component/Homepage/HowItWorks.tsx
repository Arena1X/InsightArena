import { Card, CardContent } from "@/component/ui/card"
import { Star, Shield, Trophy, Award, Users, BookOpen, Gift } from "lucide-react"


export default function HowItWorks() {
  return (
    <section className="relative pt-32 pb-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900"></div>
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center opacity-5"></div>
      </div>

      {/* Floating Stars */}
      <div className="absolute inset-0 overflow-hidden">
        <Star className="absolute top-20 left-10 w-4 h-4 text-purple-400 animate-pulse" />
        <Star className="absolute top-40 right-20 w-3 h-3 text-blue-400 animate-pulse" style={{ animationDelay: '1s' }} />
        <Star className="absolute bottom-40 left-20 w-2 h-2 text-purple-300 animate-pulse" style={{ animationDelay: '2s' }} />
        <Star className="absolute top-60 left-1/3 w-3 h-3 text-blue-300 animate-pulse" style={{ animationDelay: '0.5s' }} />
        <Star className="absolute bottom-60 right-1/3 w-4 h-4 text-purple-400 animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center space-y-6 mb-20">
          <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur-sm border border-purple-500/30 rounded-full px-6 py-2">
            <Star className="w-4 h-4 text-purple-400" />
            <span className="text-purple-300 font-medium">Your Journey Starts Here</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            How Stark Academy{' '}
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Works
            </span>
          </h2>
          <p className="text-gray-300 text-lg max-w-3xl mx-auto">
            Transform from beginner to certified trader through our revolutionary 5-step journey. Every achievement is
            verified on-chain, every milestone rewarded.
          </p>
        </div>

        {/* Timeline Steps */}
        <div className="relative">
          {/* Connecting Line */}
          <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-purple-500 via-pink-500 to-blue-500 rounded-full opacity-30 hidden lg:block"></div>

          <div className="space-y-24">
            {/* Step 1: Learn */}
            <div className="relative flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 lg:pr-16 space-y-6 order-2 lg:order-1">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-xl cursor-pointer">
                    1
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white">Learn</h3>
                </div>
                <h4 className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Master Trading Fundamentals
                </h4>
                <p className="text-gray-300">
                  Access expertly crafted modules built by top-tier traders. From basic concepts to advanced strategies,
                  our interactive curriculum adapts to your pace and learning style.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 text-xs bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 cursor-pointer">Interactive Lessons</span>
                  <span className="px-3 py-1 text-xs bg-pink-500/20 text-pink-300 rounded-full border border-pink-500/30">Expert Content</span>
                  <span className="px-3 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">Self-Paced</span>
                </div>
              </div>
              <div className="lg:w-1/2 lg:pl-16 order-1 lg:order-2">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <Card className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 p-8 cursor-pointer">
                    <CardContent className="p-0 space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center cursor-pointer">
                        <BookOpen className="w-8 h-8 text-white" />
                      </div>
                      <div className="space-y-3">
                        <div className="h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-full"></div>
                        <div className="h-3 bg-gray-700 rounded-full w-3/4"></div>
                        <div className="h-3 bg-gray-700 rounded-full w-1/2"></div>
                      </div>
                      <div className="text-sm text-gray-400 cursor-pointer">Module 1: Technical Analysis Basics</div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full border-4 border-gray-900 hidden lg:block"></div>
            </div>

            {/* Step 2: Compete */}
            <div className="relative flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 lg:pl-16 space-y-6 order-2">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-pink-600 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-xl cursor-pointer">
                    2
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white cursor-pointer">Compete</h3>
                </div>
                <h4 className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-pink-400 to-red-400 bg-clip-text text-transparent cursor-pointer">
                  Battle in Live Tournaments
                </h4>
                <p className="text-gray-300">
                  Put your skills to the test in real-time trading tournaments. Choose between simulated markets for
                  practice or real markets for the ultimate challenge. Compete globally, climb leaderboards.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 text-xs bg-red-500/20 text-red-300 rounded-full border border-red-500/30 cursor-pointer">Live Competitions</span>
                  <span className="px-3 py-1 text-xs bg-orange-500/20 text-orange-300 rounded-full border border-orange-500/30 cursor-pointer">Global Leaderboards</span>
                  <span className="px-3 py-1 text-xs bg-yellow-500/20 text-yellow-300 rounded-full border border-yellow-500/30 cursor-pointer">Real-time Trading</span>
                </div>
              </div>
              <div className="lg:w-1/2 lg:pr-16 order-1">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-r from-pink-600 to-red-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <Card className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 p-8 cursor-pointer">
                    <CardContent className="p-0 space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-red-500 rounded-2xl flex items-center justify-center cursor-pointer">
                        <Trophy className="w-8 h-8 text-white" />
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-white font-semibold cursor-pointer">Weekly Tournament</span>
                          <span className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded-full border border-green-500/30 cursor-pointer">Live</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400 cursor-pointer">Rank #1</span>
                            <span className="text-green-400 cursor-pointer">+24.7%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400 cursor-pointer">Rank #2</span>
                            <span className="text-green-400 cursor-pointer">+18.3%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-purple-400 cursor-pointer">You</span>
                            <span className="text-green-400 cursor-pointer">+12.1%</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gradient-to-r from-pink-500 to-red-500 rounded-full border-4 border-gray-900 hidden lg:block"></div>
            </div>

            {/* Step 3: Earn */}
            <div className="relative flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 lg:pr-16 space-y-6 order-2 lg:order-1">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-xl cursor-pointer">
                    3
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white cursor-pointer">Earn</h3>
                </div>
                <h4 className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent cursor-pointer">
                  Collect Rewards & Prizes
                </h4>
                <p className="text-gray-300">
                  Victory brings rewards! Win tournament prizes, receive exclusive airdrops, and collect rare badges.
                  Every achievement unlocks new opportunities and valuable rewards in the ecosystem.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 text-xs bg-yellow-500/20 text-yellow-300 rounded-full border border-yellow-500/30 cursor-pointer">Prize Pools</span>
                  <span className="px-3 py-1 text-xs bg-orange-500/20 text-orange-300 rounded-full border border-orange-500/30 cursor-pointer">Token Airdrops</span>
                  <span className="px-3 py-1 text-xs bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 cursor-pointer">Exclusive Badges</span>
                </div>
              </div>
              <div className="lg:w-1/2 lg:pl-16 order-1 lg:order-2">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <Card className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 p-8 cursor-pointer">
                    <CardContent className="p-0 space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center cursor-pointer">
                        <Gift className="w-8 h-8 text-white" />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center space-y-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg mx-auto"></div>
                          <div className="text-xs text-gray-400 cursor-pointer">Gold Badge</div>
                        </div>
                        <div className="text-center space-y-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg mx-auto"></div>
                          <div className="text-xs text-gray-400 cursor-pointer">$500 Prize</div>
                        </div>
                        <div className="text-center space-y-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg mx-auto"></div>
                          <div className="text-xs text-gray-400 cursor-pointer">Airdrop</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full border-4 border-gray-900 hidden lg:block"></div>
            </div>

            {/* Step 4: Certify */}
            <div className="relative flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 lg:pl-16 space-y-6 order-2">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-600 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xl cursor-pointer">
                    4
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white cursor-pointer">Certify</h3>
                </div>
                <h4 className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent cursor-pointer">
                  Earn NFT Credentials
                </h4>
                <p className="text-gray-300">
                  Your achievements become permanent NFT certificates stored on-chain. These credentials prove your
                  trading expertise to employers, clients, and the entire DeFi community. Build your verifiable
                  reputation.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 text-xs bg-green-500/20 text-green-300 rounded-full border border-green-500/30 cursor-pointer">NFT Certificates</span>
                  <span className="px-3 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 cursor-pointer">On-Chain Proof</span>
                  <span className="px-3 py-1 text-xs bg-teal-500/20 text-teal-300 rounded-full border border-teal-500/30 cursor-pointer">Permanent Record</span>
                </div>
              </div>
              <div className="lg:w-1/2 lg:pr-16 order-1">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <Card className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 p-8 cursor-pointer">
                    <CardContent className="p-0 space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center cursor-pointer">
                        <Award className="w-8 h-8 text-white" />
                      </div>
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="w-24 h-32 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
                            <Shield className="w-12 h-12 text-white" />
                          </div>
                          <h5 className="text-white font-semibold cursor-pointer">Advanced Trader Certificate</h5>
                          <p className="text-gray-400 text-sm cursor-pointer">Verified on StarkNet</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full border-4 border-gray-900 hidden lg:block"></div>
            </div>

            {/* Step 5: Teach */}
            <div className="relative flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 lg:pr-16 space-y-6 order-2 lg:order-1">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl cursor-pointer">
                    5
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white cursor-pointer">Teach</h3>
                </div>
                <h4 className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent cursor-pointer">
                  Become a Certified Tutor
                </h4>
                <p className="text-gray-300">
                  Excel in your journey and unlock tutor status. Share your expertise, mentor new traders, and earn
                  income while building the next generation of trading professionals. Your success becomes their
                  foundation.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30 cursor-pointer">Tutor Status</span>
                  <span className="px-3 py-1 text-xs bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30 cursor-pointer">Passive Income</span>
                  <span className="px-3 py-1 text-xs bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 cursor-pointer">Mentorship</span>
                </div>
              </div>
              <div className="lg:w-1/2 lg:pl-16 order-1 lg:order-2">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <Card className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 p-8 cursor-pointer">
                    <CardContent className="p-0 space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center cursor-pointer">
                        <Users className="w-8 h-8 text-white" />
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-white font-semibold cursor-pointer">Monthly Earnings</span>
                          <span className="text-green-400 font-bold cursor-pointer">$2,847</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400 cursor-pointer">Students Taught</span>
                            <span className="text-white cursor-pointer">127</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400 cursor-pointer">Success Rate</span>
                            <span className="text-green-400 cursor-pointer">94%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400 cursor-pointer">Rating</span>
                            <span className="text-yellow-400 cursor-pointer">4.9/5 ⭐</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full border-4 border-gray-900 hidden lg:block"></div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center mt-20 space-y-8">
          <div className="space-y-4">
            <h3 className="text-3xl font-bold text-white cursor-pointer">Ready to Start Your Journey?</h3>
            <p className="text-gray-300 text-lg max-w-2xl mx-auto cursor-pointer">
              Join thousands of traders who have transformed their careers through Stark Academy. Your path to trading
              mastery starts with a single click.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="mt-8 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl text-white font-bold hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 cursor-pointer">
              Begin Your Journey
            </button>
            <Button className="mt-8 px-8 py-2 border border-purple-500 text-purple-400 hover:bg-purple-500/10 bg-transparent rounded-2xl font-bold hover:scale-105 transition-all cursor-pointer">
              Watch Demo
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
