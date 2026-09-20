"use client";

import React from "react";
import { BabataAvatarState } from "@/lib/agent/orchestrator";

interface BabataAvatarProps {
  state: BabataAvatarState;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
  subLabel?: string;
  className?: string;
}

export const BabataAvatar: React.FC<BabataAvatarProps> = ({
  state = "idle",
  size = "md",
  showLabel = true,
  subLabel,
  className = "",
}) => {
  const sizeMap = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-36 h-36",
  };

  const ringColorMap: Record<BabataAvatarState, string> = {
    idle: "stroke-cyan-neon/40",
    thinking: "stroke-cyan-glow animate-spin",
    analyzing: "stroke-violet-subtle animate-spin",
    streaming: "stroke-cyan-neon",
    success: "stroke-emerald-cyber",
    warning: "stroke-amber-glow animate-pulse",
    error: "stroke-rose-flare animate-glitch",
    offline: "stroke-gray-600",
  };

  const glowColorMap: Record<BabataAvatarState, string> = {
    idle: "rgba(0, 240, 255, 0.25)",
    thinking: "rgba(34, 211, 238, 0.5)",
    analyzing: "rgba(139, 92, 246, 0.5)",
    streaming: "rgba(0, 240, 255, 0.6)",
    success: "rgba(16, 185, 129, 0.5)",
    warning: "rgba(245, 158, 11, 0.4)",
    error: "rgba(244, 63, 94, 0.6)",
    offline: "rgba(75, 85, 99, 0.2)",
  };

  const stateLabels: Record<BabataAvatarState, string> = {
    idle: "CORE: READY",
    thinking: "COMPUTING HEURISTICS...",
    analyzing: "ON-CHAIN SCANNING...",
    streaming: "SYNTHESIZING INTELLIGENCE...",
    success: "ANALYSIS SYNCHRONIZED",
    warning: "DEGRADED TELEMETRY",
    error: "SUBSYSTEM ANOMALY",
    offline: "LOCAL FALLBACK MODE",
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`relative ${sizeMap[size]} flex items-center justify-center rounded-full transition-all duration-300`}
        style={{
          filter: `drop-shadow(0 0 12px ${glowColorMap[state]})`,
        }}
      >
        {/* Outer Rotating HUD Ring */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            className={`${ringColorMap[state]} transition-colors duration-300`}
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          {/* Inner Geodesic Segment */}
          <circle
            cx="50"
            cy="50"
            r="36"
            className="stroke-cyan-neon/20"
            strokeWidth="1.5"
            strokeDasharray="12 8"
          />
          {/* Static Corner Tick Accents */}
          <line x1="50" y1="2" x2="50" y2="8" stroke="#00F0FF" strokeWidth="2" />
          <line x1="50" y1="92" x2="50" y2="98" stroke="#00F0FF" strokeWidth="2" />
          <line x1="2" y1="50" x2="8" y2="50" stroke="#00F0FF" strokeWidth="2" />
          <line x1="92" y1="50" x2="98" y2="50" stroke="#00F0FF" strokeWidth="2" />
        </svg>

        {/* Central Glowing Core / Aperture */}
        <div
          className={`w-1/2 h-1/2 rounded-full flex items-center justify-center transition-all duration-500 ${
            state === "thinking" || state === "analyzing"
              ? "animate-pulse"
              : state === "error"
              ? "animate-glitch"
              : ""
          }`}
          style={{
            background:
              state === "error"
                ? "radial-gradient(circle, #F43F5E 0%, #111C2B 100%)"
                : state === "warning"
                ? "radial-gradient(circle, #F59E0B 0%, #111C2B 100%)"
                : state === "success"
                ? "radial-gradient(circle, #10B981 0%, #111C2B 100%)"
                : state === "analyzing"
                ? "radial-gradient(circle, #8B5CF6 0%, #111C2B 100%)"
                : state === "offline"
                ? "radial-gradient(circle, #6B7280 0%, #111C2B 100%)"
                : "radial-gradient(circle, #00F0FF 0%, #0C1420 100%)",
          }}
        >
          {/* Cyber Icon in Center */}
          <div className="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
        </div>
      </div>

      {/* State Text Label */}
      {showLabel && (
        <div className="mt-2 text-center">
          <span className="text-[10px] tracking-widest font-mono font-bold text-cyan-glow uppercase">
            {stateLabels[state]}
          </span>
          {subLabel && (
            <p className="text-[11px] text-gray-400 font-sans mt-0.5 max-w-xs truncate">
              {subLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
};