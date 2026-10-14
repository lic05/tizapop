// Revisa suscripciones de Mercado Pago y códigos de acceso de Tizapop Plus.
// Variables en Netlify: MP_ACCESS_TOKEN, TZ_SECRETO y MP_PLAN_ID (opcional, recomendado)
const crypto = require("crypto");
const firma = s => crypto.createHmac("sha256", process.env.TZ_SECRETO || "").update(String(s)).digest("hex").slice(0, 6).toUpperCase();
const enc = id => /^[0-9a-f]{32}$/i.test(id) ? BigInt("0x" + id).toString(36).toUpperCase() : "X" + String(id).toUpperCase();
const dec = s => s.startsWith("X") ? s.slice(1).toLowerCase() : [...s.toLowerCase()].reduce((a, c) => a * 36n + BigInt(parseInt(c, 36)), 0n).toString(16).padStart(32, "0");
const codigo = id => { const b = enc(id); return "TZ-" + b + "-" + firma(b); };
const json = (o, code) => ({ statusCode: code || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(o) });
const MP = path => fetch("https://api.mercadopago.com" + path, { headers: { Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN } });
const delPlan = s => !process.env.MP_PLAN_ID || s.preapproval_plan_id === process.env.MP_PLAN_ID;
async function suscripcion(id) { const r = await MP("/preapproval/" + encodeURIComponent(id)); if (!r.ok) return null; const s = await r.json(); return delPlan(s) ? s : null; }

exports.handler = async event => {
  const q = event.queryStringParameters || {};
  if (!process.env.TZ_SECRETO || !process.env.MP_ACCESS_TOKEN) return json({ error: "faltan variables" }, 500);
  try {
    // 1) Código en otro dispositivo o revisión periódica
    if (q.code) {
      const m = String(q.code).toUpperCase().replace(/\s+/g, "").match(/^TZ-([0-9A-Z]+)-([0-9A-F]{6})$/);
      if (!m || firma(m[1]) !== m[2]) return json({ ok: false });
      const s = await suscripcion(dec(m[1]));
      if (!s) return json({ ok: false });
      return s.status === "authorized" ? json({ ok: true }) : json({ ok: false, inactive: true, status: s.status });
    }
    // 2) Regreso desde Mercado Pago con el número de suscripción
    if (q.preapproval_id) {
      const s = await suscripcion(q.preapproval_id);
      if (!s) return json({ status: "not_found" });
      return s.status === "authorized" ? json({ status: "authorized", code: codigo(s.id) }) : json({ status: s.status });
    }
    // 3) Respaldo: buscar por correo una suscripción recién creada (48 h)
    if (q.email) {
      const params = new URLSearchParams({ payer_email: String(q.email).trim().toLowerCase(), status: "authorized" });
      if (process.env.MP_PLAN_ID) params.set("preapproval_plan_id", process.env.MP_PLAN_ID);
      const r = await MP("/preapproval/search?" + params); if (!r.ok) return json({ status: "not_found" });
      const res = ((await r.json()).results || []).filter(delPlan).filter(s => Date.now() - new Date(s.date_created).getTime() < 48 * 3600e3);
      return res.length ? json({ status: "authorized", code: codigo(res[0].id) }) : json({ status: "not_found" });
    }
    return json({ error: "sin datos" }, 400);
  } catch (e) { return json({ error: "sin conexion" }, 502); }
};
