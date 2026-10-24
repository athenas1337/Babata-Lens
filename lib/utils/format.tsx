import React from "react";

/**
 * Minimal inline markdown renderer for assistant output.
 *
 * The project does not ship @tailwindcss/typography, so the `prose` classes
 * used by the chat bubbles were inert and model output rendered as raw
 * "**bold**" asterisks. This renders the small subset the agent actually
 * emits — headings, bullets, bold/italic, inline code, links — as real
 * elements, without dangerouslySetInnerHTML.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(INLINE_PATTERN);

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key} className="text-gray-50 font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-surface-3/70 text-[0.85em] font-mono text-cyan-glow">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      nodes.push(
        <a
          key={key}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-glow underline decoration-cyan-glow/40 hover:decoration-cyan-glow"
        >
          {label}
        </a>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Render agent markdown into styled blocks. Kept intentionally small and
 * dependency-free; anything it does not recognize passes through as text.
 */
export function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 space-y-1 pl-4 list-disc marker:text-cyan-glow/70">
        {listItems}
      </ul>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (!line.trim()) {
      flushList();
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      listItems.push(
        <li key={`li-${key++}`} className="leading-relaxed">{renderInline(bullet[1], `li-${key}`)}</li>
      );
      continue;
    }

    flushList();

    // Blockquote — used for run notices (e.g. "no LLM key configured").
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push(
        <p
          key={`q-${key++}`}
          className="my-1 pl-2 border-l-2 border-amber-glow/60 text-amber-glow/90 text-[0.95em]"
        >
          {renderInline(quote[1], `q-${key}`)}
        </p>
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = level <= 2 ? "text-base" : "text-sm";
      blocks.push(
        <h3 key={`h-${key++}`} className={`${size} font-mono font-bold text-cyan-glow mt-3 mb-1 first:mt-0`}>
          {renderInline(heading[2], `h-${key}`)}
        </h3>
      );
      continue;
    }

    const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push(
        <p key={`p-${key++}`} className="leading-relaxed pl-1">
          <span className="text-cyan-glow font-mono mr-1.5">{numbered[1]}.</span>
          {renderInline(numbered[2], `n-${key}`)}
        </p>
      );
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="leading-relaxed my-1 first:mt-0">
        {renderInline(line, `p-${key}`)}
      </p>
    );
  }

  flushList();
  return <>{blocks}</>;
}
