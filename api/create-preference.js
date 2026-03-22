export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      title,
      amount,
      external_reference
    } = req.body;

    // IMPORTANTE:
    // Para probar y destrabar ya, usa MXN.
    // Si tu tienda muestra EUR, conviértelo antes de llegar aquí
    // o fija un monto de prueba en MXN.
    const amountNumber = Number(amount);

    if (!amountNumber || amountNumber <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
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

    if (!mpResponse.ok) {
      return res.status(mpResponse.status).json(data);
    }

    return res.status(200).json({
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
      id: data.id
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
