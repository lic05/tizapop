// Crea el pago único (Checkout Pro de Mercado Pago) para regalar Tizapop Plus.
// Variables en Netlify: MP_ACCESS_TOKEN (la misma de siempre).
// Los precios se fijan AQUÍ (no se confía en lo que mande la página).
const PRECIOS = { 3: 279, 6: 549, 12: 999 };
const crypto = require("crypto");
exports.handler = async event => {
  const q = (event && event.queryStringParameters) || {};
  const meses = Number(q.meses);
  const txt = (code, msg) => ({ statusCode: code, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: msg });
  if (!PRECIOS[meses]) return txt(400, "Elige 3, 6 o 12 meses.");
  if (!process.env.MP_ACCESS_TOKEN) return txt(500, "Falta configurar MP_ACCESS_TOKEN.");
  const sitio = (process.env.URL || "https://tizapop.com").replace(/\/$/, "");
  const ref = "regalo-" + meses + "-" + crypto.randomBytes(12).toString("hex");
  const body = {
    items: [{ id: "tizapop-plus-regalo-" + meses, title: `Tizapop Plus de regalo · ${meses} meses`, description: "Código de regalo para Tizapop Plus (pago único, sin cobros automáticos).", quantity: 1, unit_price: PRECIOS[meses], currency_id: "MXN" }],
    external_reference: ref,
    metadata: { tipo: "regalo", meses },
    back_urls: { success: sitio + "/?regalo_pago=ok", pending: sitio + "/?regalo_pago=pendiente", failure: sitio + "/?regalo_pago=error" },
    auto_return: "approved",
    statement_descriptor: "TIZAPOP"
  };
  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", { method: "POST", headers: { Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN, "Content-Type": "application/json", "X-Idempotency-Key": ref }, body: JSON.stringify(body) });
    if (!r.ok) { console.log("MP respondió", r.status, await r.text()); return txt(502, "No pudimos abrir Mercado Pago. Intenta de nuevo en un momento."); }
    const p = await r.json();
    const ir = p.init_point || p.sandbox_init_point;
    if (!ir) return txt(502, "Mercado Pago no devolvió el enlace de pago.");
    return { statusCode: 303, headers: { Location: ir, "Cache-Control": "no-store" } };
  } catch (e) { return txt(502, "Sin conexión con Mercado Pago."); }
};
