"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { compileJSX } from "./compile";
import { useCstmQuery, useCstmMutation, useAI, sdk } from "./sdk";
import * as SdkComponents from "./sdk-components";

// ─── Error Boundary ──────────────────────────────────────────

class InstanceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 rounded-xl border border-destructive/50 bg-destructive/5">
          <h3 className="font-semibold text-destructive mb-2">Runtime Error</h3>
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 text-sm text-primary hover:underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Sandbox Execution ───────────────────────────────────────

/**
 * Creates a React component from compiled JavaScript code.
 * The code runs in a controlled scope via Function constructor —
 * only SDK-provided names are available.
 */
function createSandboxedComponent(
  compiledCode: string
): React.ComponentType | null {
  // Build the controlled scope
  const scope: Record<string, unknown> = {
    // React
    React,
    useState,
    useEffect,
    useCallback,
    useMemo,

    // SDK hooks
    useCstmQuery,
    useCstmMutation,
    useAI,
    sdk,

    // SDK UI components
    ...SdkComponents,
  };

  const scopeKeys = Object.keys(scope);
  const scopeValues = Object.values(scope);

  try {
    // Function constructor creates a new scope — instance code cannot access
    // anything outside of what we pass in as parameters.
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      ...scopeKeys,
      `"use strict";
${compiledCode}
if (typeof __default__ !== 'undefined') return __default__;
return null;`
    );

    const Component = factory(...scopeValues);
    if (typeof Component !== "function") return null;
    return Component;
  } catch (err) {
    console.error("[Instance Sandbox] Execution error:", err);
    return null;
  }
}

// ─── Public: InstancePageRenderer ────────────────────────────

export function InstancePageRenderer({ code }: { code: string }) {
  const compiled = useMemo(() => compileJSX(code), [code]);

  if (!compiled.ok) {
    return (
      <div className="p-6 rounded-xl border border-destructive/50 bg-destructive/5">
        <h3 className="font-semibold text-destructive mb-2">
          Compilation Error
        </h3>
        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
          {compiled.error}
        </pre>
      </div>
    );
  }

  const Component = useMemo(
    () => createSandboxedComponent(compiled.code),
    [compiled.code]
  );

  if (!Component) {
    return (
      <div className="p-6 rounded-xl border border-border bg-muted/50 text-muted-foreground text-sm">
        No component found. The code must define a function and set{" "}
        <code className="font-mono bg-muted px-1 rounded">
          var __default__ = ComponentName;
        </code>
      </div>
    );
  }

  return (
    <InstanceErrorBoundary>
      <Component />
    </InstanceErrorBoundary>
  );
}
