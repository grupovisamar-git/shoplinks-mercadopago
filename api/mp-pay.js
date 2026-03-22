function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

function extractOrderAndAmount(html) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  let orderRef = "";
  let amountEur = "";

  const orderPatterns = [
    /Order\s*([0-9-]+)/i,
    /Pedido\s*([0-9-]+)/i,
    /Orden\s*([0-9-]+)/i,
    /订单\s*([0-9-]+)/i
  ];

  for (const pattern of orderPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      orderRef = match[1];
      break;
    }
  }

  const direct = text.match(/Total Price\s*[^\d]*([0-9]+(?:[.,][0-9]{1,2})?)/i);
  if (direct && direct[1]) {
    const n = normalizeNumber(direct[1]);
    if (n) amountEur = String(n);
  }

  if (!amountEur) {
    const euroMatches = [...text.matchAll(/€\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi)];
    if (euroMatches.length) {
      const n = normalizeNumber(euroMatches[euroMatches.length - 1][1]);
      if (n) amountEur = String(n);
    }
  }

  return { orderRef, amountEur };
}

async function fetchCheckoutHtml(url, cookie, userAgent) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      cookie: cookie || "",
      "user-agent": userAgent || "Mozilla/5.0",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Checkout fetch failed: ${response.status}`);
  }

  return await response.text();
}

function buildAlternateUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.replace(/^www\./, "");
      return u.toString();
    } else {
      u.hostname = "www." + u.hostname;
      return u.toString();
    }
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  const referer = req.headers.referer || "";
  const cookie = req.headers.cookie || "";
  const userAgent = req.headers["user-agent"] || "";

  let initialOrderRef = "";
  let initialAmountEur = "";
  let debugInfo = "";

  try {
    if (referer && referer.includes("/checkouts/") && referer.includes("step=payment_gateway")) {
      const attempts = [referer];
      const alt = buildAlternateUrl(referer);
      if (alt && alt !== referer) attempts.push(alt);

      for (const attempt of attempts) {
        try {
          const html = await fetchCheckoutHtml(attempt, cookie, userAgent);
          const parsed = extractOrderAndAmount(html);

          debugInfo += `TRY: ${attempt}\n`;
          debugInfo += `PARSED ORDER: ${parsed.orderRef || "[vacío]"}\n`;
          debugInfo += `PARSED EUR: ${parsed.amountEur || "[vacío]"}\n`;

          if (parsed.orderRef && parsed.amountEur) {
            initialOrderRef = parsed.orderRef;
            initialAmountEur = parsed.amountEur;
            break;
          }
        } catch (err) {
          debugInfo += `TRY ERROR: ${attempt} => ${err.message}\n`;
        }
      }
    } else {
      debugInfo = "No llegó referer válido de payment_gateway";
    }
  } catch (err) {
    debugInfo += `SERVER PARSE ERROR: ${err.message}\n`;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mercado Pago</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f7f7f7;
      margin: 0;
      padding: 40px 20px;
      color: #222;
    }
    .box {
      max-width: 760px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 28px;
      box-shadow: 0 8px 30px rgba(0,0,0,.05);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
    }
    p {
      line-height: 1.5;
      margin: 10px 0;
    }
    .muted {
      color: #666;
      font-size: 14px;
    }
    .status {
      margin: 16px 0 18px;
      font-weight: 600;
    }
    .fxbox {
      margin: 16px 0 22px;
      padding: 14px 16px;
      background: #f3f8ff;
      border: 1px solid #d7e7ff;
      border-radius: 8px;
      line-height: 1.6;
      display: none;
    }
    .fxbox strong {
      color: #0b63c9;
    }
    .field {
      margin: 14px 0;
    }
    .field label {
      display: block;
      font-size: 14px;
      margin-bottom: 6px;
      color: #444;
    }
    .field input {
      width: 100%;
      padding: 12px;
      border: 1px solid #d8d8d8;
      border-radius: 8px;
      font-size: 15px;
      box-sizing: border-box;
    }
    .btn {
      background: #009ee3;
      color: #fff;
      border: none;
      padding: 14px 18px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn:disabled {
      opacity: .65;
      cursor: not-allowed;
    }
    .debug {
      margin-top: 18px;
      padding: 12px;
      background: #fafafa;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      font-size: 12px;
      white-space: pre-wrap;
      color: #666;
      display: none;
    }
  </style>
</head>
<body>
  <div class="box">
    <h1>Mercado Pago</h1>
    <p>Estamos preparando tu pago.</p>
    <p class="muted">Si no redirige automáticamente, podrás continuar con el botón.</p>

    <div id="status" class="status">Leyendo datos del pedido...</div>

    <div id="fxInfo" class="fxbox"></div>

    <div class="field">
      <label>Número de orden</label>
      <input id="orderRef" type="text" placeholder="Ej. 205599-540144">
    </div>

    <div class="field">
      <label>Total original en EUR</label>
      <input id="amountEur" type="text" placeholder="Ej. 1.00">
    </div>

    <button id="payBtn" class="btn">Pagar con Mercado Pago</button>

    <div id="debug" class="debug"></div>
  </div>

  <script>
    (function () {
      const ENDPOINT = "https://shoplinks-mercadopago.vercel.app/api/create-preference";
      const RATE_API = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=MXN";

      const INITIAL_ORDER_REF = ${JSON.stringify(initialOrderRef)};
      const INITIAL_AMOUNT_EUR = ${JSON.stringify(initialAmountEur)};
      const DEBUG_INFO = ${JSON.stringify(debugInfo)};

      const statusEl = document.getElementById("status");
      const fxInfoEl = document.getElementById("fxInfo");
      const orderRefEl = document.getElementById("orderRef");
      const amountEurEl = document.getElementById("amountEur");
      const payBtn = document.getElementById("payBtn");
      const debugEl = document.getElementById("debug");

      function setStatus(msg) {
        statusEl.textContent = msg;
      }

      function normalizeNumber(value) {
        if (value === null || value === undefined) return null;
        const n = parseFloat(String(value).replace(",", ".").trim());
        return isNaN(n) ? null : n;
      }

      function round2(n) {
        return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
      }

      async function getEurMxnRate() {
        const response = await fetch(RATE_API);
        if (!response.ok) {
          throw new Error("No se pudo consultar el tipo de cambio");
        }

        const data = await response.json();

        if (!data.rates || !data.rates.MXN) {
          throw new Error("La respuesta del tipo de cambio no contiene MXN");
        }

        return {
          rate: Number(data.rates.MXN),
          date: data.date || ""
        };
      }

      function renderFxInfo(eurAmount, rate, mxnAmount, date) {
        fxInfoEl.style.display = "block";
        fxInfoEl.innerHTML =
          "<div><strong>Tipo de cambio de referencia:</strong> 1 EUR = " + rate.toFixed(4) + " MXN" + (date ? " (" + date + ")" : "") + "</div>" +
          "<div><strong>Monto original:</strong> €" + eurAmount.toFixed(2) + " EUR</div>" +
          "<div><strong>Total final a pagar:</strong> $" + mxnAmount.toFixed(2) + " MXN</div>";
      }

      async function createPreferenceAndRedirect(orderRef, mxnAmount) {
        if (!orderRef || !mxnAmount) {
          setStatus("Faltan datos para iniciar el pago.");
          return;
        }

        try {
          payBtn.disabled = true;
          setStatus("Conectando con Mercado Pago...");

          const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title: "Pedido " + orderRef,
              amount: mxnAmount,
              external_reference: orderRef
            })
          });

          const data = await response.json();

          if (!response.ok) {
            console.error(data);
            throw new Error("No se pudo crear la preferencia");
          }

          const targetUrl = data.init_point || data.sandbox_init_point;

          if (!targetUrl) {
            throw new Error("No llegó init_point");
          }

          window.location.href = targetUrl;
        } catch (err) {
          console.error(err);
          setStatus("No se pudo iniciar Mercado Pago. Usa el botón para intentarlo.");
          payBtn.disabled = false;
        }
      }

      async function calculateAndPay(orderRef, eurAmount, autoGo) {
        const eur = normalizeNumber(eurAmount);

        if (!orderRef || !eur || eur <= 0) {
          setStatus("Faltan datos del pedido.");
          payBtn.disabled = false;
          return;
        }

        const fx = await getEurMxnRate();
        const mxnAmount = round2(eur * fx.rate);

        renderFxInfo(eur, fx.rate, mxnAmount, fx.date);

        if (autoGo) {
          setStatus("Pedido detectado. Tipo de cambio calculado. Redirigiendo a Mercado Pago...");
          setTimeout(function () {
            createPreferenceAndRedirect(orderRef, mxnAmount);
          }, 1200);
        } else {
          setStatus("Tipo de cambio calculado. Continuando con Mercado Pago...");
          createPreferenceAndRedirect(orderRef, mxnAmount);
        }
      }

      payBtn.addEventListener("click", async function () {
        payBtn.disabled = true;
        try {
          await calculateAndPay(orderRefEl.value.trim(), amountEurEl.value.trim(), false);
        } catch (err) {
          console.error(err);
          setStatus("No se pudo calcular el tipo de cambio. Revisa los datos e intenta de nuevo.");
          payBtn.disabled = false;
        }
      });

      console.log("INITIAL_ORDER_REF:", INITIAL_ORDER_REF);
      console.log("INITIAL_AMOUNT_EUR:", INITIAL_AMOUNT_EUR);
      console.log("DEBUG_INFO:", DEBUG_INFO);

      if (DEBUG_INFO) {
        debugEl.style.display = "block";
        debugEl.textContent = DEBUG_INFO;
      }

      if (INITIAL_ORDER_REF) orderRefEl.value = INITIAL_ORDER_REF;
      if (INITIAL_AMOUNT_EUR) amountEurEl.value = INITIAL_AMOUNT_EUR;

      if (INITIAL_ORDER_REF && INITIAL_AMOUNT_EUR) {
        calculateAndPay(INITIAL_ORDER_REF, INITIAL_AMOUNT_EUR, true);
      } else {
        setStatus("No pude detectar automáticamente los datos del pedido.");
        payBtn.disabled = false;
      }
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
