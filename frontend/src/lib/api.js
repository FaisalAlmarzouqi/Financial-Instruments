async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request to ${path} failed (${res.status})`);
  }
  return data;
}

export const api = {
  listAssets: () => request("/assets"),
  getAsset: (symbol) => request(`/assets/${symbol}`),
  getPriceHistory: (symbol) => request(`/assets/${symbol}/price-history`),

  getUser: (wallet) => request(`/users/${wallet}`).catch(() => null),
  register: (formData) => request("/users/register", { method: "POST", body: formData }),

  getPortfolio: (wallet) => request(`/portfolio/${wallet}`),

  getOrderBook: (symbol) => request(`/orders?symbol=${symbol}`),
  placeLimitOrder: (body) => request("/orders", { method: "POST", body: JSON.stringify(body) }),
  placeMarketOrder: (body) => request("/orders/market", { method: "POST", body: JSON.stringify(body) }),

  verifyDeposit: (body) => request("/deposits/verify", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body) => request("/withdrawals", { method: "POST", body: JSON.stringify(body) }),
};
