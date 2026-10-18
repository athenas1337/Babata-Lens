"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  buildMiniSymbolOverviewParams,
  TRADINGVIEW_MINI_CHART_BASE,
} from "@/lib/tradingview/symbols";

export interface TradingViewMiniChartProps {
  symbol: string;
  height?: number;
  className?: string;
}

/**
 * Compact TradingView mini symbol-overview widget.
 * Used inside market scanner cards and compact HUD panels.
 */
export const TradingViewMiniChart: React.FC<TradingViewMiniChartProps> = ({
  symbol,
  height = 130,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useMemo(
    () => `tv_mini_${Math.random().toString(36).slice(2, 10)}`,
    [symbol]
  );

  const src = useMemo(
    () => `${TRADINGVIEW_MINI_CHART_BASE}${buildMiniSymbolOverviewParams(symbol)}`,
    [symbol]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.id = widgetId;
    iframe.title = `TradingView mini chart for ${symbol}`;
    iframe.src = src;
    iframe.style.width = "100%";
    iframe.style.height = `${height}px`;
    iframe.style.border = "none";
    iframe.style.display = "block";
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
      className={`w-full rounded-md overflow-hidden bg-canvas ${className}`}
      style={{ minHeight: height }}
      data-testid="tradingview-mini-chart"
    />
  );
};
