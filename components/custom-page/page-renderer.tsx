"use client";

import { DataTableComponent } from "./components/data-table";
import { FormComponent } from "./components/form-component";
import { StatsComponent } from "./components/stats-component";
import { TextComponent } from "./components/text-component";
import { cn } from "@/lib/utils";

export type ComponentConfig = {
  id: string;
  type: "data-table" | "form" | "stats" | "text";
  title?: string;
  props: Record<string, unknown>;
};

export type PageConfig = {
  layout?: "stack" | "grid-2" | "grid-3";
  components: ComponentConfig[];
};

function renderComponent(config: ComponentConfig) {
  switch (config.type) {
    case "data-table":
      return <DataTableComponent key={config.id} config={config} />;
    case "form":
      return <FormComponent key={config.id} config={config} />;
    case "stats":
      return <StatsComponent key={config.id} config={config} />;
    case "text":
      return <TextComponent key={config.id} config={config} />;
    default:
      return (
        <div key={config.id} className="p-4 border border-border rounded-xl text-sm text-muted-foreground">
          Unknown component type: {config.type}
        </div>
      );
  }
}

export function PageRenderer({ config }: { config: PageConfig }) {
  const layout = config.layout || "stack";
  const components = config.components || [];

  if (components.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Táto sekcia zatiaľ nemá obsah.</p>
        <p className="text-xs mt-1">Použite UI Agent na vytvorenie obsahu.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "gap-6",
        layout === "stack" && "flex flex-col",
        layout === "grid-2" && "grid grid-cols-1 md:grid-cols-2",
        layout === "grid-3" && "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {components.map((comp) => renderComponent(comp))}
    </div>
  );
}
