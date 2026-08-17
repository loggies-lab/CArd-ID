const fs = require('fs');

async function testComps() {
  const envText = fs.readFileSync('.env.local', 'utf8');
  const clientId = envText.match(/EBAY_CLIENT_ID=(.*)/)?.[1]?.trim();
  const clientSecret = envText.match(/EBAY_CLIENT_SECRET=(.*)/)?.[1]?.trim();

  console.log("Client ID:", clientId ? "Found" : "Missing");
  console.log("Client Secret:", clientSecret ? "Found" : "Missing");

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

  const rawQueryInput = "2026 Topps Chrome Basketball #154 Kon Knueppel X-Fractor RC";

  // Let's test various query cleanups
  const queriesToTest = [
    rawQueryInput,
    rawQueryInput.replace(/#/g, "").replace(/\b2026\b/g, "").trim(),
    "Kon Knueppel Topps Chrome X-Fractor",
    "Kon Knueppel Topps Chrome #154",
    "Kon Knueppel X-Fractor",
  ];

  for (const q of queriesToTest) {
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
    console.log(`\n--- Query: "${q}" ---`);
    console.log(`Total found: ${data.total || data.itemSummaries?.length || 0}`);
    if (data.itemSummaries && data.itemSummaries.length > 0) {
      data.itemSummaries.slice(0, 3).forEach((item, idx) => {
        console.log(` [${idx + 1}] $${item.price?.value} - ${item.title}`);
      });
    }
  }
}

testComps();
