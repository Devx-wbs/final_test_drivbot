let allCoins = [];
let currentChart = null;
let chartMode = "line";
let refreshInterval;
let currentId = "bitcoin";

async function fetchMajorCoins() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50"
  );
  return await res.json();
}

function formatPrice(p) {
  if (p > 1) return `$${p.toFixed(2)}`;
  if (p > 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

async function fetchChartData(id, days) {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  return await (await fetch(url)).json();
}

function prepareCandleData(prices) {
  return prices.map((p) => ({
    x: p[0],
    o: p[1],
    h: p[2],
    l: p[3],
    c: p[4],
  }));
}

async function drawChart(id, days, type, showVolume) {
  const data = await fetchChartData(id, days);
  const ctx = document.getElementById("chart").getContext("2d");

  const labels = data.prices.map((p) => new Date(p[0]).toLocaleString());
  const priceData = data.prices.map((p) => p[1]);
  const volumeData = data.total_volumes.map((v) => v[1]);

  if (currentChart) currentChart.destroy();

  const datasets = [];

  if (type === "line") {
    datasets.push({
      label: "Price",
      data: priceData,
      borderColor: "#4677f5",
      fill: false,
    });
  } else {
    datasets.push({
      label: "Candlestick",
      data: prepareCandleData(data.prices),
      type: "candlestick",
    });
  }

  if (showVolume) {
    datasets.push({
      label: "Volume",
      data: volumeData,
      type: "bar",
      yAxisID: "vol",
      backgroundColor: "rgba(0,150,136,0.3)",
    });
  }

  currentChart = new Chart(ctx, {
    type: type === "line" ? "line" : "bar",
    data: { labels, datasets },
    options: {
      scales: {
        x: { ticks: { color: "#333" } },
        y: { display: true },
        vol: { display: showVolume, position: "right", beginAtZero: true },
      },
      plugins: { legend: { display: true } },
      responsive: true,
    },
  });
}

async function updateCoinInfo(id) {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}`);
  const d = await res.json();
  const p = d.market_data.current_price.usd;
  const c = d.market_data.price_change_percentage_24h;
  const sign = c >= 0 ? "▲" : "▼";
  document.getElementById("coin-info").innerHTML = `
    <strong>${d.name} (${d.symbol.toUpperCase()})</strong><br>
    Price: ${formatPrice(p)} • <span style="color:${
    c >= 0 ? "green" : "red"
  }">${c.toFixed(2)}% ${sign}</span>
  `;
}

async function refreshAll() {
  await updateCoinInfo(currentId);
  await drawChart(
    currentId,
    document.getElementById("timeframe-select").value,
    chartMode,
    document.getElementById("volume-toggle").checked
  );
}

async function initMarketWidget() {
  try {
    const major = await fetchMajorCoins();
    allCoins = major.map((c) => ({ id: c.id, symbol: c.symbol, name: c.name }));

    const sel = document.getElementById("coin-select");
    sel.innerHTML = allCoins
      .map(
        (c) =>
          `<option value="${c.id}">${
            c.name
          } (${c.symbol.toUpperCase()})</option>`
      )
      .join("");
    sel.value = currentId;

    sel.addEventListener("change", () => {
      currentId = sel.value;
      refreshAll();
    });
    document.getElementById("toggle-chart").addEventListener("click", () => {
      chartMode = chartMode === "line" ? "candlestick" : "line";
      document.getElementById("toggle-chart").innerText =
        chartMode === "line" ? "Switch to Candle" : "Switch to Line";
      refreshAll();
    });
    document
      .getElementById("timeframe-select")
      .addEventListener("change", refreshAll);
    document
      .getElementById("volume-toggle")
      .addEventListener("change", refreshAll);

    await refreshAll();

    refreshInterval = setInterval(refreshAll, 30000);
  } catch (e) {
    console.error("Market widget init failed:", e);
  }
}

window.addEventListener("DOMContentLoaded", initMarketWidget);
