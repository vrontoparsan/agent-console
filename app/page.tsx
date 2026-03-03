import Link from "next/link";
import { Zap, Database, Brain, BarChart3, Shield, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-lg">Agent Bizi</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-border hover:bg-accent transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 text-xs text-muted-foreground mb-6">
          <Zap className="h-3 w-3 text-primary" />
          AI-Powered Business Management
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-[1.1]">
          Your business, managed by{" "}
          <span className="text-primary">intelligent agents</span>
        </h1>
        <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto leading-relaxed">
          Agent Bizi gives your company a custom AI-powered workspace. Track events, manage data,
          build custom sections — all with an AI assistant that understands your business.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-11 px-8 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors gap-2"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-11 px-8 border border-border hover:bg-accent transition-colors"
          >
            Learn more
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
          Everything you need to run your business
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          A complete platform that grows with your company.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="AI Agent"
            description="Chat with an AI that knows your data. Ask questions, get insights, and automate tasks."
          />
          <FeatureCard
            icon={<Database className="h-5 w-5" />}
            title="Custom Sections"
            description="Build custom data tables and interactive pages. No code needed — your AI agent handles it."
          />
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Event Tracking"
            description="Track business events from email, voice, and manual input. AI categorizes and suggests actions."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Full Isolation"
            description="Your data is completely isolated. Own database schema, own settings, own AI configuration."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
          Simple, transparent pricing
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          Start with a free trial. No credit card required.
        </p>
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Standard */}
          <div className="rounded-xl border border-border p-8 flex flex-col">
            <h3 className="text-lg font-semibold">Standard</h3>
            <p className="text-muted-foreground text-sm mt-1">For growing businesses</p>
            <div className="mt-6">
              <span className="text-4xl font-bold">790</span>
              <span className="text-muted-foreground ml-1">EUR/month</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm flex-1">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Unlimited custom sections
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                AI agent with full database access
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Event tracking (email, voice, manual)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Snapshots and backups
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Up to 10 users
              </li>
            </ul>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-6 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Enterprise */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 flex flex-col">
            <h3 className="text-lg font-semibold">Enterprise</h3>
            <p className="text-muted-foreground text-sm mt-1">For large organizations</p>
            <div className="mt-6">
              <span className="text-4xl font-bold">Custom</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm flex-1">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Everything in Standard
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Unlimited users
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Priority support
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Custom integrations
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#10003;</span>
                Dedicated infrastructure
              </li>
            </ul>
            <a
              href="mailto:info@agentbizi.com"
              className="mt-8 inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-6 border border-border hover:bg-accent transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Ready to transform your business?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
          Join companies using Agent Bizi to streamline operations with AI.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-11 px-8 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors gap-2"
        >
          Get Started
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span>Agent Bizi</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Agent Bizi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border p-6 hover:border-primary/30 transition-colors">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
