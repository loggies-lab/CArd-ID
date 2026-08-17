const fs = require('fs');

async function testSmartFallback(cardInput) {
  const envText = fs.readFileSync('.env.local', 'utf8');
  const clientId = envText.match(/EBAY_CLIENT_ID=(.*)/)?.[1]?.trim();
  const clientSecret = envText.match(/EBAY_CLIENT_SECRET=(.*)/)?.[1]?.trim();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;

  function cleanQueryStr(str) {
    if (!str || typeof str !== 'string') return "";
    return str
      .replace(/#/g, "") // Remove #
      .replace(/\b(202[4-9]|2030)\b/g, "") // Remove standalone single years like 2026
      .replace(/\s+/g, " ")
      .trim();
  }

  const rawQuery = cardInput.raw || "";

  const stages = [
    rawQuery, // Raw original
    cleanQueryStr(rawQuery), // Cleaned (no #, no standalone year)
    `${cardInput.playerName || ""} ${cardInput.brand || ""} ${cardInput.subsetParallel || ""}`.trim(), // Player + Brand + Parallel
    `${cardInput.playerName || ""} ${cardInput.brand || ""} ${cardInput.cardNumber || ""}`.replace(/#/g, "").trim(), // Player + Brand + Card#
  ];

  console.log("Testing search query stages for raw:", rawQuery);

  for (let i = 0; i < stages.length; i++) {
    const q = stages[i];
    if (!q) continue;

    const rawSearchQuery = `${q} -PSA -BGS -SGC -CGC -Graded -Lot -Pack -Box -Digital`;
    const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    searchUrl.searchParams.set("q", rawSearchQuery);
    searchUrl.searchParams.set("limit", "10");

    const res = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    const data = await res.json();
    const items = data.itemSummaries || [];
    console.log(`Stage ${i + 1} ["${q}"] -> Found ${items.length} items`);
    if (items.length > 0) {
      items.slice(0, 3).forEach((item, idx) => {
        console.log(`   [${idx + 1}] $${item.price?.value} - ${item.title}`);
      });
      break; // Found results!
    }
  }
}

testSmartFallback({
  raw: "2026 Topps Chrome Basketball #154 Kon Knueppel X-Fractor RC",
  playerName: "Kon Knueppel",
  brand: "Topps Chrome",
  subsetParallel: "X-Fractor",
  cardNumber: "#154"
});
