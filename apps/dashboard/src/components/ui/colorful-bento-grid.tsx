"use client";

import { cn } from "@/lib/utils";
import { Gift, Zap, Brain, BookOpen, Map } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const ColorfulBentoGrid = () => {
  return (
    <section
      id="free-tools"
      className="bg-white rounded-3xl p-4 my-16 max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row items-end justify-between w-full">
        <div className="flex flex-col my-12 w-full items-start justify-start gap-4">
          <div className="flex flex-col md:flex-row gap-2 items-end w-full justify-between">
            <h2 className="relative text-4xl md:text-5xl font-sans font-semibold max-w-xl text-left leading-[1em] text-base-content">
              Private client work,{" "}
              <br />
              <span>
                <Gift
                  className="inline-flex text-accent fill-accent/10 rotate-12"
                  size={40}
                  strokeWidth={2}
                />
              </span>{" "}
              now public &amp; free.
            </h2>
            <p className="max-w-sm font-semibold text-md text-neutral/50">
              Working with us is like having an activation growth taskforce of a
              Data Scientist, PLG Advisor, &amp; Behavioral Designer in-house.
              Always ready to go.
            </p>
          </div>

          <div className="flex flex-row text-accent gap-6 items-start justify-center">
            <p className="text-base whitespace-nowrap font-medium">
              +1,000 Downloads
            </p>
            <p className="text-base whitespace-nowrap font-medium">
              Rated 5/5 by 100 Founders
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 md:items-start md:justify-start gap-4">
        {/* UX + Product-Led — wide card */}
        <Link
          href="/resources/freebies"
          className="md:col-span-2 overflow-hidden hover:scale-101 hover:shadow-[-6px_6px_32px_8px_rgba(192,192,192,0.2)] hover:rotate-1 transition-all duration-200 ease-in-out h-[330px] relative bg-accent/20 rounded-xl flex flex-row items-center gap-8 justify-between px-3 pt-3 pb-6"
        >
          <div className="relative flex flex-col items-start justify-center ml-4 gap-0 z-10">
            <p className="-rotate-1 ml-4 mb-1 text-base-content">
              1,000 downloads
            </p>
            <h3 className="-rotate-1 text-2xl whitespace-nowrap font-semibold text-center px-6 py-2 bg-base-content/90 text-white rounded-full">
              UX + Product-Led
            </h3>
          </div>
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <Image
              src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"
              alt="UX and Product-Led resources"
              fill
              className="object-cover opacity-20"
            />
          </div>
          <div className="absolute bottom-6 right-6">
            <Zap className="w-16 h-16 text-accent opacity-30" />
          </div>
        </Link>

        {/* Growth Tools */}
        <Link
          href="/resources/tools"
          className="overflow-hidden md:hover:scale-105 hover:shadow-[-6px_6px_32px_8px_rgba(192,192,192,0.2)] hover:rotate-3 transition-all duration-200 ease-in-out relative bg-highlight/20 h-[330px] rounded-xl flex flex-col items-center justify-between px-3 py-6"
        >
          <div className="flex flex-col items-center justify-center gap-1 z-10">
            <p className="rotate-6 mb-1 text-base-content">10,000 uses</p>
            <h3 className="rotate-6 text-2xl font-semibold text-center px-6 py-2 bg-base-content/90 text-white rounded-full">
              Growth Tools
            </h3>
          </div>
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <Image
              src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80"
              alt="Growth tools"
              fill
              className="object-cover opacity-15"
            />
          </div>
          <div className="absolute bottom-6">
            <Zap className="w-16 h-16 text-highlight opacity-25" />
          </div>
        </Link>

        {/* Improve UX / Behavioral Principles */}
        <Link
          href="/resources/behavior-principles"
          className="overflow-hidden md:hover:scale-105 hover:shadow-[-6px_6px_32px_8px_rgba(192,192,192,0.2)] hover:-rotate-3 transition-all duration-200 ease-in-out relative bg-secondary/20 h-[330px] rounded-xl flex flex-col items-center justify-between px-5 py-6"
        >
          <div className="flex flex-col items-center justify-center gap-1 z-10">
            <p className="-rotate-3 mb-1 text-base-content">
              106 Behavioral Principles
            </p>
            <h3 className="-rotate-3 text-2xl font-semibold text-center px-6 py-2 bg-base-content/90 text-white rounded-full">
              Improve UX
            </h3>
          </div>
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <Image
              src="https://images.unsplash.com/photo-1559028006-448665bd7c7f?w=600&q=80"
              alt="UX behavior principles"
              fill
              className="object-cover opacity-15"
            />
          </div>
          <div className="absolute bottom-6">
            <Brain className="w-16 h-16 text-neutral opacity-20" />
          </div>
        </Link>

        {/* Blog & Guides — coming soon */}
        <div className="pointer-events-none overflow-hidden relative bg-base-100 h-[330px] rounded-xl flex flex-col items-center justify-center px-5 py-6">
          <p className="-rotate-3 mb-1 text-base-content">Blog &amp; Guides</p>
          <h3 className="-rotate-3 text-2xl font-semibold text-center px-6 py-2 bg-white/75 rounded-full">
            Coming Soon
          </h3>
          <BookOpen className="absolute bottom-6 w-14 h-14 text-neutral opacity-15" />
        </div>

        {/* Playbooks — coming soon */}
        <div className="pointer-events-none overflow-hidden relative bg-primary/20 h-[330px] rounded-xl flex flex-col items-center justify-center px-5 py-6">
          <p className="rotate-6 mb-1 text-base-content">Playbooks</p>
          <h3 className="rotate-6 text-2xl font-semibold text-center px-6 py-2 bg-white/75 rounded-full">
            Coming Soon
          </h3>
          <Map className="absolute bottom-6 w-14 h-14 text-primary opacity-25" />
        </div>
      </div>
    </section>
  );
};
