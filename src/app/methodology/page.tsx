import type { Metadata } from "next";
import { METHODOLOGY_VERSION, SCORED_METRICS } from "@/lib/scoring";

export const metadata: Metadata = {
  title: "Methodology",
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
        <li>Each plan starts from a clean Ubuntu 24.04 install with default settings.</li>
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
        The full test script is still being built. Until it&apos;s ready, official results come from{" "}
        <a href="https://github.com/masonr/yet-another-bench-script">yabs.sh</a>, run by us on a clean server. That means:
      </p>
      <ul>
        <li>
          <strong>CPU:</strong> Geekbench 6 single-core and multi-core scores.
        </li>
        <li>
          <strong>Disk:</strong> fio with a 50/50 mix of random reads and writes, at 4K and 1M block sizes.
        </li>
        <li>
          <strong>Network:</strong> iperf3 to yabs&apos; public test servers in Europe, Asia and the Americas. We use the
          median across locations, so one busy server doesn&apos;t sink a result.
        </li>
        <li>
          <strong>Stability:</strong> not measured yet. Plans show &ldquo;—&rdquo; here until the 48-hour run is live.
        </li>
      </ul>

      <h2>How scores work</h2>
      <ol>
        <li>Each metric is converted to a percentile among all official tests.</li>
        <li>Category scores (CPU, disk, network, stability) are the average of their metrics.</li>
        <li>The overall score is the average of the categories a plan has results for.</li>
        <li>The value score divides the overall score by the monthly price.</li>
      </ol>
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
