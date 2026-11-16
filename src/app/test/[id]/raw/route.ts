import { getRawOutput } from "@/lib/data";

// The pasted benchmark output exactly as stored, so anyone can check our
// numbers against the source.
export async function GET(_req: Request, ctx: RouteContext<"/test/[id]/raw">) {
  const { id } = await ctx.params;
  const text = /^\d{1,9}$/.test(id) ? await getRawOutput(Number(id)) : null;
  if (text === null) {
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(text.endsWith("\n") ? text : `${text}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `inline; filename="benchdesk-test-${id}.txt"`,
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=300",
    },
  });
}
