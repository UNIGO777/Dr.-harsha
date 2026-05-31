import mongoose from "mongoose";
import dns from "dns";
import { URL } from "url";

const FALLBACK_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"];
const DNS_TEST_HOSTNAME = "google.com";

/**
 * Test whether the system DNS resolver is working.
 * Returns { ok: true } or { ok: false, error }.
 */
async function testSystemDns() {
  return new Promise((resolve) => {
    dns.resolve4(DNS_TEST_HOSTNAME, (err, addresses) => {
      if (err) resolve({ ok: false, error: err.code || err.message });
      else resolve({ ok: true, addresses });
    });
  });
}

/**
 * Resolve SRV records for an Atlas mongodb+srv URI manually using a given DNS server.
 * Returns the list of host:port pairs or throws.
 */
async function resolveSrvWithCustomDns(hostname, dnsServer) {
  return new Promise((resolve, reject) => {
    const resolver = new dns.Resolver();
    resolver.setServers([dnsServer]);
    resolver.resolveSrv(`_mongodb._tcp.${hostname}`, (err, records) => {
      if (err) return reject(err);
      resolve(records.map((r) => `${r.name}:${r.priority ? r.port : r.port}`));
    });
  });
}

/**
 * Resolve TXT records (for replicaSet and authSource) using a given DNS server.
 */
async function resolveTxtWithCustomDns(hostname, dnsServer) {
  return new Promise((resolve, reject) => {
    const resolver = new dns.Resolver();
    resolver.setServers([dnsServer]);
    resolver.resolveTxt(hostname, (err, records) => {
      if (err) return resolve([]); // TXT is optional
      resolve(records.map((r) => r.join("")));
    });
  });
}

/**
 * Convert a mongodb+srv:// URI into a standard mongodb:// URI by manually
 * resolving SRV and TXT records via a specified DNS server.
 */
async function convertSrvToStandard(srvUri, dnsServer) {
  const parsed = new URL(srvUri);
  const srvHost = parsed.hostname;

  const srvRecords = await resolveSrvWithCustomDns(srvHost, dnsServer);
  if (!srvRecords.length) throw new Error(`No SRV records found for ${srvHost}`);

  const txtRecords = await resolveTxtWithCustomDns(srvHost, dnsServer);

  // Build standard connection string
  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? ":" + parsed.password : ""}@`
    : "";
  const hosts = srvRecords.map((r) => r).join(",");
  const db = parsed.pathname || "/";
  const existingParams = parsed.search ? parsed.search.slice(1) : "";
  const txtParams = txtRecords.length ? txtRecords[0] : "";

  // Merge params: existing query string params take priority over TXT
  const mergedParams = [txtParams, existingParams].filter(Boolean).join("&");
  // Add ssl=true which is implied by SRV
  const finalParams = mergedParams.includes("ssl=") || mergedParams.includes("tls=")
    ? mergedParams
    : `${mergedParams}${mergedParams ? "&" : ""}tls=true`;

  return `mongodb://${auth}${hosts}${db}?${finalParams}`;
}

/**
 * Main connection function with DNS fallback and retry logic.
 */
export async function connectDb({ mongoUri, retries = 3, retryDelayMs = 3000 } = {}) {
  const uri =
    typeof mongoUri === "string" && mongoUri.trim()
      ? mongoUri.trim()
      : process.env.MONGODB_URI || process.env.MONGO_URI || "";

  if (!uri) return { connected: false, reason: "Missing MONGODB_URI/MONGO_URI" };
  if (mongoose.connection.readyState === 1) return { connected: true, fallbackUsed: false };

  const isSrv = uri.startsWith("mongodb+srv://");
  const connectionOpts = {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 15_000,
    maxIdleTimeMS: 30_000,
  };

  // Step 1: Test system DNS
  const dnsCheck = await testSystemDns();
  console.log(`[DB] System DNS check: ${dnsCheck.ok ? "OK" : "FAILED (" + dnsCheck.error + ")"}`);

  // Step 2: If system DNS works or URI is not SRV, try direct connection first
  if (dnsCheck.ok || !isSrv) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[DB] Connection attempt ${attempt}/${retries} (direct)...`);
        await mongoose.connect(uri, connectionOpts);
        if (mongoose.connection.readyState === 1) {
          console.log("[DB] Connected successfully (direct).");
          return { connected: true, fallbackUsed: false };
        }
      } catch (err) {
        const errMsg = err?.message || String(err);
        console.warn(`[DB] Attempt ${attempt} failed: ${errMsg}`);

        // If this is a DNS/SRV error and we still have fallback available, break early
        if (isSrv && (errMsg.includes("querySrv") || errMsg.includes("ECONNREFUSED") || errMsg.includes("ENOTFOUND"))) {
          console.log("[DB] SRV resolution failure detected, switching to DNS fallback...");
          break;
        }

        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
        }
      }
    }
  }

  // Step 3: DNS fallback — resolve SRV manually with Cloudflare/Google DNS
  if (isSrv) {
    for (const dnsServer of FALLBACK_DNS_SERVERS) {
      try {
        console.log(`[DB] Attempting SRV resolution via fallback DNS ${dnsServer}...`);
        const standardUri = await convertSrvToStandard(uri, dnsServer);
        console.log(`[DB] SRV resolved via ${dnsServer}. Connecting with standard URI...`);

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            console.log(`[DB] Connection attempt ${attempt}/${retries} (fallback DNS: ${dnsServer})...`);
            await mongoose.connect(standardUri, connectionOpts);
            if (mongoose.connection.readyState === 1) {
              console.log(`[DB] Connected successfully (fallback DNS: ${dnsServer}).`);
              return { connected: true, fallbackUsed: true, dnsServer };
            }
          } catch (connErr) {
            console.warn(`[DB] Fallback attempt ${attempt} failed: ${connErr?.message || connErr}`);
            if (attempt < retries) {
              await new Promise((r) => setTimeout(r, retryDelayMs));
            }
          }
        }
      } catch (srvErr) {
        console.warn(`[DB] SRV resolution via ${dnsServer} failed: ${srvErr?.message || srvErr}`);
      }
    }
  }

  console.error("[DB] All connection attempts exhausted. MongoDB not connected.");
  return { connected: false, reason: "All connection attempts failed" };
}
