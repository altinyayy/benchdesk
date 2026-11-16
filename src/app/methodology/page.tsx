import type { Metadata } from "next";
import { METHODOLOGY_VERSION, MIN_PLANS_FOR_SCORES, SCORED_METRICS } from "@/lib/scoring";

export const metadata: Metadata = {
  title: "Methodology",
  alternates: { canonical: "/methodology" },
  description: "How Benchdesk tests VPS plans: the same open script on every server, a 48-hour stability run, and public raw results.",
};

export default function Methodology() {
  return (
    <main className="in prose">
      <h1>How we test</h1>
      <p className="lead">
        Every plan goes through the same script on a clean server. This page explains what we measure and how scores are
        calculated. It will grow as the test suite does.
      </p>

      <h2>The setup</h2>
      <ul>
        <li>
          Each plan starts from a clean install of the newest Ubuntu LTS the provider offers, with default settings. Every
          test page lists the exact version.
        </li>
        <li>We use only open-source tools, so anyone can repeat the test.</li>
        <li>When the test ends, the server is deleted.</li>
      </ul>

      <h2>What the full test measures</h2>
      <ul>
        <li>
          <strong>CPU:</strong> sysbench and the 7-Zip built-in benchmark.
        </li>
        <li>
          <strong>Disk:</strong> fio with 4K random reads and writes, plus 64K and 1M sequential tests.
        </li>
        <li>
          <strong>Network:</strong> iperf3 and ping against our own test server in Virginia, USA.
        </li>
        <li>
          <strong>Stability:</strong> short CPU and disk tests repeated every 30 minutes for 48 hours. This catches
          &ldquo;noisy neighbors&rdquo; and plans that slow down under sustained load.
        </li>
      </ul>

      <h2>Where we are today</h2>
      <p>
        The 48-hour stability run is still being built. Until it&apos;s ready, every official result comes from one
        short run of our <a href="/bench.sh">bench.sh</a> script (about 20 minutes) on a clean server:
      </p>
      <ul>
        <li>
          <strong>CPU:</strong> sysbench (prime numbers, 30 seconds on 1 thread and on all threads) and the 7-Zip
          built-in benchmark (1 thread and all threads).
        </li>
        <li>
          <strong>Disk:</strong> fio through{" "}
          <a href="https://github.com/masonr/yet-another-bench-script">yabs.sh</a>, pinned to one version, with a 50/50
          mix of random reads and writes at 4K and 1M block sizes.
        </li>
        <li>
          <strong>Network:</strong> iperf3 through yabs.sh to public test servers in Europe, Asia and the Americas. We
          use the median across locations, so one busy server doesn&apos;t sink a result.
        </li>
        <li>
          <strong>Stability:</strong> not measured yet. Plans show &ldquo;—&rdquo; here until the 48-hour run is live.
        </li>
      </ul>
      <p>We don&apos;t use Geekbench: its license doesn&apos;t cover publishing scores on a site like this one.</p>

      <h2 id="scores">How scores work</h2>
      <ol>
        <li>Each metric is converted to a percentile among all official tests.</li>
        <li>Category scores (CPU, disk, network, stability) are the average of their metrics.</li>
        <li>The overall score is the average of the categories a plan has results for.</li>
        <li>The value score divides the overall score by the monthly price.</li>
      </ol>
      <p>
        Because scores compare plans with each other, they mean little with only a few tests: a plan tested on its own
        lands at exactly 50 in everything. So we only show scores once {MIN_PLANS_FOR_SCORES} plans have an official
        result. Until then, pages show the raw measurements instead.
      </p>
      <p>
        Raw results are always stored, so when the formula changes every test is recalculated. Each score records the
        methodology version it was calculated with. Current version: <strong>{METHODOLOGY_VERSION}</strong>.
      </p>
      <p>Metrics in the current version:</p>
      <ul>
        {SCORED_METRICS.map((m) => (
          <li key={m.key}>
            <strong>{m.category === "cpu" ? "CPU" : m.category[0].toUpperCase() + m.category.slice(1)}:</strong> {m.label}
          </li>
        ))}
      </ul>

      <h2>Official and community results</h2>
      <p>
        Official results come from servers we set up and test ourselves. Community results come from pasted yabs.sh
        output; they are labeled &ldquo;unverified&rdquo; and never mixed into the official rankings.
      </p>

      <h2 id="money">How we make money</h2>
      <p>
        Some providers give us credits to cover testing costs, and some links are affiliate links. Sponsored providers and
        affiliate links are always labeled. Sponsorship never changes a score or a ranking, and bad results are published
        for sponsors too.
      </p>
    </main>
  );
}
