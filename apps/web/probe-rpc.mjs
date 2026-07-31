import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const address = "0xaAc1757714Dd7DccD7a9Cdf1f9c518d0Fbb7e201";
const c = createClient({ chain: studionet });
console.log("rpc:", studionet.rpcUrls.default.http);
try {
  const n = await c.readContract({ address, functionName: "get_deal_count", args: [] });
  console.log("get_deal_count =", n);
} catch (e) {
  console.log("READ FAILED:", e?.shortMessage || e?.message);
  console.log(String(e).slice(0, 800));
}
