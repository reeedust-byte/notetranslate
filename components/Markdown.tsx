"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { linkifyTimestamps } from "@/lib/time";

interface Props {
  text: string;
  /** Called with a timeline position when a [mm:ss] citation is clicked. */
  onSeek?: (ms: number) => void;
  className?: string;
}

function MarkdownImpl({ text, onSeek, className }: Props) {
  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith("#t=")) {
        const ms = Number(href.slice(3));
        return (
          <button type="button" className="ts-chip" onClick={() => onSeek?.(ms)} title="跳到这一刻">
            ▸{children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };
  return (
    <div className={`md ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {linkifyTimestamps(text)}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
