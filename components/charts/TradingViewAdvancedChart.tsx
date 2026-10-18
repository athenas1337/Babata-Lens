"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  AdvancedChartOptions,
  buildAdvancedChartParams,
  TRADINGVIEW_ADVANCED_CHART_BASE,
  ChartInterval,
} from "@/lib/tradingview/symbols";

export interface TradingViewAdvancedChartProps {
  symbol: string;
  interval?: ChartInterval;
  height?: number;
  studies?: string[];
  allowSymbolChange?: boolean;
  className?: string;
}

/**
 * TradingView Advanced Chart embed.
 *
 * The widget is a sandboxed iframe served by TradingView. We inject the widget
 * script on mount so it works in an SSR/Next.js App Router context without
 * shipping the third-party script on first paint.
 */
export const TradingViewAdvancedChart: React.FC<TradingViewAdvancedChartProps> = ({
  symbol,
  interval = "D",
  height = 520,
  studies,
  allowSymbolChange = false,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useMemo(
    () => `tv_advanced_${Math.random().toString(36).slice(2, 10)}`,
    // Regenerate only when the symbol/interval changes so the widget remounts.
    [symbol, interval]
  );

  const src = useMemo(() => {
    const params = buildAdvancedChartParams({
      symbol,
      interval,
      theme: "dark",
      allowSymbolChange,
      studies,
    } satisfies AdvancedChartOptions);
    return `${TRADINGVIEW_ADVANCED_CHART_BASE}${params}`;
  }, [symbol, interval, allowSymbolChange, studies]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean previous widget to avoid duplicate iframes on prop changes.
    container.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.id = widgetId;
    iframe.title = `TradingView chart for ${symbol}`;
    iframe.src = src;
    iframe.style.width = "100%";
    iframe.style.height = `${height}px`;
    iframe.style.border = "none";
    iframe.style.display = "block";
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    );

    container.appendChild(iframe);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [src, height, widgetId, symbol]);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-lg overflow-hidden bg-canvas ${className}`}
      style={{ minHeight: height }}
      data-testid="tradingview-advanced-chart"
    />
  );
};
