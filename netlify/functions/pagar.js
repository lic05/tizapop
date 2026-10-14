// Manda a la clienta al link de suscripción que creaste en Mercado Pago.
// Variable en Netlify: MP_PLAN_LINK (el link que copias al crear tu plan)
exports.handler = async () => {
  const link = process.env.MP_PLAN_LINK;
  if (!link) return { statusCode: 500, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Falta configurar el link de suscripción (MP_PLAN_LINK)." };
  return { statusCode: 303, headers: { Location: link, "Cache-Control": "no-store" } };
};
