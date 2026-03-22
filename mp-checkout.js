(function () {
  window.mpCheckoutLoaded = true;
  console.log("MP EXTERNAL SCRIPT LOADED", window.location.href);

  const ENDPOINT = "https://shoplinks-mercadopago.vercel.app/api/create-preference";
  const STORE_CURRENCY = "EUR";

  function isGatewayPage() {
    const params = new URLSearchParams(window.location.search);
    return (
      window.location.pathname.includes("/checkouts/") &&
      params.get("step") === "payment_gateway"
    );
  }

  if (!isGatewayPage()) return;

  function getText() {
    return document.body ? (document.body.innerText || "") : "";
  }

  function getOrderReference() {
    const text = getText();

    const patterns = [
      /Order\s*([0-9-]+)/i,
      /Pedido\s*([0-9-]+)/i,
      /Orden\s*([0-9-]+)/i,
      /订单\s*([0-9-]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1];
    }

    const parts = (window.location.pathname || "").split("/").filter(Boolean);
    return parts[parts.length - 1] || ("shoplinks-" + Date.now());
  }

  function getFinalAmount() {
    const text = getText();

    const direct = text.match(/Total Price\s*[^\d]*([0-9]+(?:[.,][0-9]{1,2})?)/i);
    if (direct && direct[1]) {
      const amount = parseFloat(direct[1].replace(",", "."));
      if (!isNaN(amount) && amount > 0) return amount;
    }

    const euroMatches = [...text.matchAll(/€\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi)];
    if (euroMatches.length) {
      const last = euroMatches[euroMatches.length - 1][1];
      const amount = parseFloat(last.replace(",", "."));
      if (!isNaN(amount) && amount > 0) return amount;
    }

    return null;
  }

  function hideOldMercadoPagoText() {
    const blocks = document.querySelectorAll("div, p, span");
    blocks.forEach(function (el) {
      const t = (el.innerText || "").trim();
      if (
        t.includes("Elegiste pagar con Mercado Pago") ||
        t.includes("Para completar tu pago") ||
        t.includes("No realices transferencia manual") ||
        t.includes("Si sales de la página antes de pagar")
      ) {
        el.style.display = "none";
      }
    });
  }

  async function pay() {
    const status = document.getElementById("mp-inline-status");
    const btn = document.getElementById("mp-inline-pay");

    const amount = getFinalAmount();
    const orderReference = getOrderReference();

    if (!amount) {
      if (status) status.textContent = "No pude detectar el monto del pedido.";
      return;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Conectando...";
        btn.style.opacity = "0.7";
      }
      if (status) status.textContent = "Conectando con Mercado Pago...";

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: "Pedido Shoplinks",
          amount: amount,
          currency_id: STORE_CURRENCY,
          external_reference: orderReference
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("MP create-preference error:", data);
        if (status) status.textContent = "No se pudo iniciar Mercado Pago. Intenta de nuevo.";
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Pagar con Mercado Pago";
          btn.style.opacity = "1";
        }
        return;
      }

      const url = data.init_point || data.sandbox_init_point;

      if (!url) {
        if (status) status.textContent = "No recibí la URL de pago de Mercado Pago.";
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Pagar con Mercado Pago";
          btn.style.opacity = "1";
        }
        return;
      }

      window.location.href = url;
    } catch (error) {
      console.error("MP redirect error:", error);
      if (status) status.textContent = "Error de conexión con Mercado Pago. Intenta de nuevo.";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Pagar con Mercado Pago";
        btn.style.opacity = "1";
      }
    }
  }

  function buildInlineBox() {
    if (document.getElementById("mp-inline-box")) return true;

    const pageText = getText().toLowerCase();
    if (!pageText.includes("mercado pago")) return false;

    hideOldMercadoPagoText();

    const box = document.createElement("div");
    box.id = "mp-inline-box";
    box.style.margin = "24px 0";
    box.style.padding = "20px";
    box.style.border = "1px solid #e5e5e5";
    box.style.background = "#fff";
    box.style.borderRadius = "4px";
    box.style.fontFamily = "inherit";

    const title = document.createElement("div");
    title.textContent = "Mercado Pago";
    title.style.fontSize = "22px";
    title.style.fontWeight = "600";
    title.style.marginBottom = "10px";

    const desc = document.createElement("div");
    desc.id = "mp-inline-status";
    desc.textContent = "Haz clic en el botón para pagar con Mercado Pago.";
    desc.style.fontSize = "16px";
    desc.style.lineHeight = "1.5";
    desc.style.color = "#333";
    desc.style.marginBottom = "16px";

    const btn = document.createElement("button");
    btn.id = "mp-inline-pay";
    btn.type = "button";
    btn.textContent = "Pagar con Mercado Pago";
    btn.style.background = "#009ee3";
    btn.style.color = "#fff";
    btn.style.border = "none";
    btn.style.padding = "14px 18px";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "16px";
    btn.style.fontWeight = "600";

    btn.addEventListener("click", pay);

    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(btn);

    const target =
      document.querySelector("#order_payment_method") ||
      document.querySelector(".order_payment_method") ||
      document.querySelector("main") ||
      document.body;

    if (target && target.parentNode) {
      target.parentNode.insertBefore(box, target.nextSibling);
      return true;
    }

    return false;
  }

  function buildFloatingFallback() {
    if (document.getElementById("mp-floating-pay")) return;

    const btn = document.createElement("button");
    btn.id = "mp-floating-pay";
    btn.type = "button";
    btn.textContent = "Pagar con Mercado Pago";
    btn.style.position = "fixed";
    btn.style.right = "20px";
    btn.style.bottom = "20px";
    btn.style.zIndex = "999999";
    btn.style.background = "#009ee3";
    btn.style.color = "#fff";
    btn.style.border = "none";
    btn.style.padding = "16px 20px";
    btn.style.borderRadius = "10px";
    btn.style.fontSize = "16px";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 8px 24px rgba(0,0,0,.18)";

    btn.addEventListener("click", pay);

    document.body.appendChild(btn);
  }

  let tries = 0;
  const timer = setInterval(function () {
    tries += 1;

    if (document.body) {
      const inserted = buildInlineBox();
      if (!inserted && tries > 3) {
        buildFloatingFallback();
      }
    }

    if (tries > 20) {
      clearInterval(timer);
    }
  }, 500);
})();
