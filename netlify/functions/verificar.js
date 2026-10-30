// Revisa suscripciones de Mercado Pago y códigos de acceso de Tizapop Plus.
// Variables en Netlify: MP_ACCESS_TOKEN, TZ_SECRETO, MP_PLAN_ID (recomendado) y MP_PLAN_ID_ANUAL (si activas el plan anual)
// También revisa los códigos de regalo (TZ-REGALO-...), que salen de pagos únicos hechos con la función "regalo".
const crypto = require("crypto");
const firma = s => crypto.createHmac("sha256", process.env.TZ_SECRETO || "").update(String(s)).digest("hex").slice(0, 6).toUpperCase();
// Códigos: el número de suscripción (32 caracteres hexadecimales) convertido a base 36.
// Si Mercado Pago diera un número con otro formato, se codifica con "Y" delante (reversible, respeta mayúsculas).
// Como un código normal también puede empezar con X o Y, al revisar se prueban todas las lecturas posibles.
const b36 = s => [...s.toLowerCase()].reduce((a, c) => a * 36n + BigInt(parseInt(c, 36)), 0n);
const enc = id => /^[0-9a-f]{32}$/i.test(id) ? BigInt("0x" + id).toString(36).toUpperCase() : "Y" + BigInt("0x" + Buffer.from(String(id), "utf8").toString("hex")).toString(36).toUpperCase();
const lecturas = s => {
  const out = [];
  const n = b36(s); if (n < (1n << 128n)) out.push(n.toString(16).padStart(32, "0"));
  if (s.startsWith("Y")) { let h = b36(s.slice(1)).toString(16); if (h.length % 2) h = "0" + h; out.push(Buffer.from(h, "hex").toString("utf8")); }
  if (s.startsWith("X")) out.push(s.slice(1).toLowerCase());
  return out;
};
const codigo = id => { const b = enc(id); return "TZ-" + b + "-" + firma(b); };
const json = (o, code) => ({ statusCode: code || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(o) });
const MP = path => fetch("https://api.mercadopago.com" + path, { headers: { Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN } });
const PLANES = [process.env.MP_PLAN_ID, process.env.MP_PLAN_ID_ANUAL].filter(Boolean);
const delPlan = s => !process.env.MP_PLAN_ID || PLANES.includes(s.preapproval_plan_id);
// ---- regalos ----
const GRACIA_DIAS = 30; // días extra para canjear el regalo
const codigoRegalo = pagoId => { const b = BigInt(String(pagoId).replace(/\D/g, "") || "0").toString(36).toUpperCase(); return "TZ-REGALO-" + b + "-" + firma("R" + b); };
const vence = p => { const d = new Date(p.date_approved || p.date_created); const m = Number((p.metadata || {}).meses) || 0; d.setMonth(d.getMonth() + m); d.setDate(d.getDate() + GRACIA_DIAS); return d; };
const esRegalo = p => p && (p.metadata || {}).tipo === "regalo" && /^regalo-/.test(p.external_reference || "");
async function pago(id) { const r = await MP("/v1/payments/" + encodeURIComponent(id)); if (!r.ok) { console.log("MP respondió", r.status, "para pago", id); return null; } return r.json(); }
let MOTIVO = "";
async function suscripcion(id) { const r = await MP("/preapproval/" + encodeURIComponent(id)); if (!r.ok) { MOTIVO = "mercadopago_" + r.status; console.log("MP respondió", r.status, "para", id); return null; } const s = await r.json(); if (!delPlan(s)) { MOTIVO = "otro_plan"; console.log("Suscripción de otro plan:", s.preapproval_plan_id, "≠", process.env.MP_PLAN_ID); return null; } return s; }

exports.handler = async event => {
  const q = event.queryStringParameters || {};
  if (!process.env.TZ_SECRETO || !process.env.MP_ACCESS_TOKEN) return json({ error: "faltan variables" }, 500);
  try {
    // 0) Código de regalo
    const cr = q.code && String(q.code).toUpperCase().replace(/\s+/g, "").match(/^TZ-REGALO-([0-9A-Z]+)-([0-9A-F]{6})$/);
    if (cr) {
      if (firma("R" + cr[1]) !== cr[2]) return json({ ok: false, motivo: "firma" });
      const p = await pago(b36(cr[1]).toString());
      if (!esRegalo(p)) return json({ ok: false, motivo: "regalo_no_encontrado" });
      if (p.status !== "approved") return json({ ok: false, inactive: true, status: p.status });
      const h = vence(p); return Date.now() < h.getTime() ? json({ ok: true, regalo: true, hasta: h.toISOString() }) : json({ ok: false, inactive: true, vencido: true, hasta: h.toISOString() });
    }
    // 0b) Regreso desde Mercado Pago tras comprar un regalo (necesita el número de pago y su referencia)
    if (q.pago) {
      const p = await pago(String(q.pago).replace(/\D/g, ""));
      if (!esRegalo(p) || p.external_reference !== String(q.ref || "")) return json({ status: "not_found" });
      if (p.status !== "approved") return json({ status: p.status });
      return json({ status: "approved", code: codigoRegalo(p.id), meses: Number(p.metadata.meses) || 0, hasta: vence(p).toISOString() });
    }
    // 1) Código en otro dispositivo o revisión periódica
    if (q.code) {
      const m = String(q.code).toUpperCase().replace(/\s+/g, "").match(/^TZ-([0-9A-Z]+)-([0-9A-F]{6})$/);
      if (!m) return json({ ok: false, motivo: "formato" });
      if (firma(m[1]) !== m[2]) return json({ ok: false, motivo: "firma" });
      let s = null;
      for (const id of lecturas(m[1])) { s = await suscripcion(id); if (s) break; }
      if (!s) return json({ ok: false, motivo: MOTIVO, v: 4 });
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
      let res = [];
      for (const plan of (PLANES.length ? PLANES : [""])) {
        const params = new URLSearchParams({ payer_email: String(q.email).trim().toLowerCase(), status: "authorized" });
        if (plan) params.set("preapproval_plan_id", plan);
        const r = await MP("/preapproval/search?" + params); if (!r.ok) continue;
        res = res.concat(((await r.json()).results || []).filter(delPlan).filter(s => Date.now() - new Date(s.date_created).getTime() < 48 * 3600e3));
      }
      return res.length ? json({ status: "authorized", code: codigo(res[0].id) }) : json({ status: "not_found" });
    }
    return json({ error: "sin datos" }, 400);
  } catch (e) { return json({ error: "sin conexion" }, 502); }
};
