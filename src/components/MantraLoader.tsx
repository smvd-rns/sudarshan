"use client";

import { useEffect, useState } from "react";

const MANTRA_WORDS = [
  "Hare", "Kṛṣṇa", "Hare", "Kṛṣṇa",
  "Kṛṣṇa", "Kṛṣṇa", "Hare", "Hare",
  "Hare", "Rāma", "Hare", "Rāma",
  "Rāma", "Rāma", "Hare", "Hare"
];

export default function MantraLoader() {
  const [activeWordIndex, setActiveWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWordIndex((prev) => (prev + 1) % MANTRA_WORDS.length);
    }, 450); // Highlight next word every 450ms
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-50 font-outfit px-4 text-center">


      {/* Maha Mantra Display Grid */}
      <div className="space-y-3 sm:space-y-4 max-w-md mx-auto">
        {[0, 1, 2, 3].map((lineIndex) => (
          <div key={lineIndex} className="flex justify-center gap-x-2 sm:gap-x-4">
            {[0, 1, 2, 3].map((wordIndexInLine) => {
              const globalIndex = lineIndex * 4 + wordIndexInLine;
              const word = MANTRA_WORDS[globalIndex];
              const isActive = activeWordIndex === globalIndex;

              return (
                <span
                  key={wordIndexInLine}
                  className={`text-lg sm:text-2xl font-black uppercase tracking-wide transition-all duration-300 transform ${
                    isActive
                      ? "text-orange-500 scale-110 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]"
                      : "text-slate-300 scale-100 opacity-60"
                  }`}
                >
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mt-8 animate-pulse">
        Connecting to the library...
      </p>
    </div>
  );
}
