export default async function handler(req, res) {
  const allowedOrigins = [
    "https://zaravvip.shop",
    "https://www.zaravvip.shop",
    "https://mimi1.shoplinks.cn"
  ];

  const origin = req.headers.origin || "";

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Missing MP_ACCESS_TOKEN"
      });
    }

    const { title, amount, external_reference } = req.body;

    const amountNumber = Number(amount);

    if (!amountNumber || amountNumber <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
        received_amount: amount
      });
    }

    const preference = {
      items: [
        {
          title: title || `Pedido ${external_reference || ""}`.trim(),
          quantity: 1,
          currency_id: "MXN",
          unit_price: amountNumber
        }
      ],
      external_reference: external_reference || "",
      back_urls: {
        success: "https://zaravvip.shop/apps/mp-pay?status=success",
        failure: "https://zaravvip.shop/apps/mp-pay?status=failure",
        pending: "https://zaravvip.shop/apps/mp-pay?status=pending"
      },
      auto_return: "approved"
    };

    console.log("REQ BODY:", req.body);
    console.log("PREFERENCE:", preference);

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`
        },
        body: JSON.stringify(preference)
      }
    );

    const data = await mpResponse.json();

    console.log("MP STATUS:", mpResponse.status);
    console.log("MP RESPONSE:", data);

    if (!mpResponse.ok) {
      return res.status(mpResponse.status).json({
        step: "mercadopago_error",
        preference_sent: preference,
        mp_response: data
      });
    }

    return res.status(200).json({
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
      id: data.id
    });
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
