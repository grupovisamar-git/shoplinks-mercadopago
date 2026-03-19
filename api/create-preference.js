export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { title, amount, currency_id, external_reference } = req.body || {};

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: [
            {
              title: title || "Pedido Shoplinks",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency_id || "MXN"
            }
          ],
          back_urls: {
            success: process.env.STORE_URL + "/?mp=success",
            pending: process.env.STORE_URL + "/?mp=pending",
            failure: process.env.STORE_URL + "/?mp=failure"
          },
          auto_return: "approved",
          external_reference: external_reference || `shoplinks-${Date.now()}`
        })
      }
    );

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      return res.status(mpResponse.status).json(data);
    }

    return res.status(200).json({
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error creating preference",
      detail: error.message
    });
  }
}
