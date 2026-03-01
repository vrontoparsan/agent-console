"use client";

import type { ComponentConfig } from "../page-renderer";

export function TextComponent({ config }: { config: ComponentConfig }) {
  const { content } = config.props as { content: string };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {config.title && (
        <div className="px-4 py-3 border-b border-border bg-card">
          <h3 className="text-sm font-semibold">{config.title}</h3>
        </div>
      )}
      <div className="p-4 prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
