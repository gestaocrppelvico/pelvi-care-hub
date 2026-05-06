// gcal-push is DISABLED — the app no longer creates/edits/deletes Google Calendar events.
// All calendar management is done directly in Google Calendar by the secretary/admin.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return new Response(JSON.stringify({
    ok: true,
    message: "gcal-push is disabled. Events are managed directly in Google Calendar.",
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
