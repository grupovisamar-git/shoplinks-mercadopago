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

    let preparedMxnAmount = null;
    let preparedSignature = "";

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

    function getCurrentSignature() {
      const orderRef = orderRefEl.value.trim();
      const eur = normalizeNumber(amountEurEl.value.trim());
      return orderRef + "|" + String(eur);
    }

    function resetPreparedState() {
      preparedMxnAmount = null;
      preparedSignature = "";
      payBtn.textContent = "Calcular y continuar";
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

    async function preparePaymentData() {
      const orderRef = orderRefEl.value.trim();
      const eur = normalizeNumber(amountEurEl.value.trim());

      if (!orderRef || !eur || eur <= 0) {
        setStatus("Faltan datos del pedido.");
        payBtn.disabled = false;
        return false;
      }

      setStatus("Calculando tipo de cambio...");
      payBtn.disabled = true;

      const fx = await getEurMxnRate();
      const mxnAmount = round2(eur * fx.rate);

      renderFxInfo(eur, fx.rate, mxnAmount, fx.date);

      preparedMxnAmount = mxnAmount;
      preparedSignature = getCurrentSignature();

      setStatus("Revisa el importe convertido y haz clic en “Continuar a Mercado Pago”.");
      payBtn.textContent = "Continuar a Mercado Pago";
      payBtn.disabled = false;

      return true;
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
        setStatus("No se pudo iniciar Mercado Pago. Intenta de nuevo.");
        payBtn.disabled = false;
      }
    }

    payBtn.addEventListener("click", async function () {
      try {
        const currentSignature = getCurrentSignature();

        if (!preparedMxnAmount || preparedSignature !== currentSignature) {
          await preparePaymentData();
          return;
        }

        await createPreferenceAndRedirect(orderRefEl.value.trim(), preparedMxnAmount);
      } catch (err) {
        console.error(err);
        setStatus("No se pudo calcular el tipo de cambio. Revisa los datos e intenta de nuevo.");
        payBtn.disabled = false;
      }
    });

    orderRefEl.addEventListener("input", resetPreparedState);
    amountEurEl.addEventListener("input", resetPreparedState);

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
      preparePaymentData();
    } else {
      setStatus("No pude detectar automáticamente los datos del pedido. Captúralos manualmente.");
      payBtn.disabled = false;
      payBtn.textContent = "Calcular y continuar";
    }
  })();
</script>
