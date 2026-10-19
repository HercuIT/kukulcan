// Edge Function compile-xml: reemplaza la Cloud Function compileXML.
// Corre con verify_jwt = true (supabase/config.toml), así que solo usuarios autenticados llegan aquí.
import { compileRequest, LIMITS, readTextLimited } from "./compiler.mjs";

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("Origin"));

  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405, headers: cors });

  const body = await readTextLimited(req);
  if (body === null) {
    return new Response(
      JSON.stringify({
        message: `El workflow supera el tamaño máximo (${LIMITS.maxBodyBytes} bytes).`,
        errors: [],
      }),
      { status: 413, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const result = compileRequest(body);

  if (result.status !== 200) {
    return new Response(JSON.stringify(result.json), {
      status: result.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(result.xml, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
});
