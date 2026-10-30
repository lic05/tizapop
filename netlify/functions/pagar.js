// Manda a la clienta al link de suscripción que creaste en Mercado Pago.
// Variables en Netlify:
//   MP_PLAN_LINK        link del plan mensual (el que ya tienes)
//   MP_PLAN_LINK_ANUAL  link del plan anual (nuevo, solo si activas el plan anual)
exports.handler = async event => {
  const anual = ((event && event.queryStringParameters) || {}).plan === "anual";
  const link = anual ? process.env.MP_PLAN_LINK_ANUAL : process.env.MP_PLAN_LINK;
  if (!link) return { statusCode: 500, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: anual ? "Falta configurar el link del plan anual (MP_PLAN_LINK_ANUAL)." : "Falta configurar el link de suscripción (MP_PLAN_LINK)." };
  return { statusCode: 303, headers: { Location: link, "Cache-Control": "no-store" } };
};
