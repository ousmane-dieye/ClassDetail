"use client";

import React, { useState } from "react";
import { Check, Copy, Code2 } from "lucide-react";

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) || trimmed.startsWith("/dashboard");
}

function renderInline(text: string, keyPrefix: string | number): React.ReactNode[] {
  const RE = /(`[^`]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\n]+\))/g;
  const parts = text.split(RE);
  const out: React.ReactNode[] = [];
  let key = 0;

  for (const part of parts) {
    if (!part) continue;
    const k = `${keyPrefix}-${key++}`;

    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      out.push(
        <code key={k} className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-primary">
          {part.slice(1, -1)}
        </code>
      );
      continue;
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(<strong key={k} className="font-bold text-foreground">{renderInline(part.slice(2, -2), k)}</strong>);
      continue;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.includes("**")) {
      out.push(<em key={k} className="italic text-foreground">{renderInline(part.slice(1, -1), k)}</em>);
      continue;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, rawUrl] = linkMatch;
      const url = (rawUrl ?? "").trim();
      if (isSafeUrl(url)) {
        out.push(
          <a
            key={k}
            href={url}
            target={url.startsWith("/") ? undefined : "_blank"}
            rel={url.startsWith("/") ? undefined : "noopener noreferrer"}
            className="text-primary underline underline-offset-4 hover:text-primary/80 font-medium"
          >
            {label}
          </a>
        );
      } else {
        out.push(label);
      }
      continue;
    }

    out.push(part);
  }

  return out;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split("\n");

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-border bg-slate-950 font-mono text-xs text-slate-100 shadow-lift">
      {/* Header code bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-slate-400">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider">{lang || "code"}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
        >
          {copied ? (
            <>
              <Check size={12} className="text-success" />
              <span className="text-success font-semibold">Copié !</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>

      {/* Code container with line numbers */}
      <div className="overflow-x-auto p-4 leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-900/50">
                <td className="w-8 select-none pr-4 text-right text-[11px] font-mono text-slate-600">
                  {idx + 1}
                </td>
                <td className="whitespace-pre font-mono text-slate-200">
                  {line}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let key = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const k = key++;

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++;
      blocks.push(<CodeBlock key={k} code={codeLines.join("\n")} lang={lang} />);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3;
      const text = heading[2]!;
      const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      blocks.push(
        <Tag key={k} className={`${level === 1 ? "mt-3 text-lg font-bold tracking-tight text-foreground" : level === 2 ? "mt-2 text-base font-semibold text-foreground" : "mt-1.5 text-sm font-semibold text-foreground"}`}>
          {renderInline(text, k)}
        </Tag>
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={k} className="my-2 list-disc space-y-1 pl-5 text-foreground">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `${k}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={k} className="my-2 list-decimal space-y-1 pl-5 text-foreground">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `${k}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={k} className="my-2 border-l-4 border-primary/50 bg-primary/5 p-3 rounded-r-xl italic text-muted-foreground">
          {renderInline(quoteLines.join("\n"), k)}
        </blockquote>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    blocks.push(
      <p key={k} className="my-1.5 leading-relaxed text-foreground">
        {renderInline(line, k)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1 text-sm">{blocks}</div>;
}
