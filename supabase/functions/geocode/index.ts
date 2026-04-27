// Geocodifica endereço via OpenStreetMap Nominatim (gratuito, sem API key)
// Política de uso: https://operations.osmfoundation.org/policies/nominatim/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { endereco, cidade, estado } = await req.json();
    const query = [endereco, cidade, estado, "Brasil"].filter(Boolean).join(", ");
    if (!query) {
      return new Response(JSON.stringify({ error: "Endereço vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim exige um User-Agent identificável
        "User-Agent": "CRPPelvicoApp/1.0 (contato@crppelvico.com.br)",
        "Accept-Language": "pt-BR",
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Nominatim ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hit = data[0];
    return new Response(
      JSON.stringify({
        found: true,
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        display_name: hit.display_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
