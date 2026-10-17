const ABI = [
  "function admin() view returns (address)",
  "function minReward() view returns (uint256)",
  "function reportCount() view returns (uint256)",
  "function getReport(uint256) view returns (tuple(uint256 id, address reporter, address finder, string title, string location, string description, string claimNote, uint256 reward, uint64 createdAt, uint64 deadline, uint64 claimedAt, uint8 status))",
  "function reportLost(string, string, string, uint256) payable returns (uint256)",
  "function claimFound(uint256, string)",
  "function withdrawClaim(uint256)",
  "function rejectClaim(uint256)",
  "function confirmReturn(uint256)",
  "function cancelReport(uint256)",
  "function resolveDispute(uint256, bool)"
];
const STATUS = ["Open", "Claimed", "Returned", "Cancelled"];
const EXPLORERS = { 11155111: "https://sepolia.etherscan.io/tx/" };

let contract, account, admin, chainId, reports = [];
const $ = (id) => document.getElementById(id);
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Builds DOM nodes with text nodes only, so on-chain text can never inject HTML.
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === "onclick" ? (el.onclick = v) : el.setAttribute(k, v);
  el.append(...kids.flat().filter((x) => x != null));
  return el;
}

function toast(msg, type = "info", hash) {
  const t = h("div", { class: "toast " + type }, msg);
  if (hash && EXPLORERS[chainId]) t.append(" ", h("a", { href: EXPLORERS[chainId] + hash, target: "_blank", rel: "noopener" }, "View transaction"));
  else if (hash) t.append(" (tx " + short(hash) + ")");
  $("toasts").prepend(t);
  setTimeout(() => t.remove(), type === "error" ? 12000 : 7000);
}

function reason(e) {
  if (e.code === "ACTION_REJECTED" || e.code === 4001) return "You rejected the request in MetaMask.";
  return e.reason || e.info?.error?.message || e.shortMessage || e.message || "Unknown error";
}

async function connect() {
  if (!window.ethereum) return toast("MetaMask not found. Install the extension and reload this page.", "error");
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    account = await signer.getAddress();
    chainId = Number((await provider.getNetwork()).chainId);
    if ((await provider.getCode(CONTRACT_ADDRESS)) === "0x")
      return toast("No contract at " + short(CONTRACT_ADDRESS) + " on this network. Check config.js and your MetaMask network.", "error");
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    admin = await contract.admin();
    $("walletInfo").textContent = short(account) + " on chain " + chainId + (same(account, admin) ? " (admin)" : "");
    $("connectBtn").textContent = "Connected";
    await refresh();
  } catch (e) { toast(reason(e), "error"); }
}

async function refresh() {
  const n = Number(await contract.reportCount());
  reports = await Promise.all(Array.from({ length: n }, (_, i) => contract.getReport(n - i)));
  const provider = contract.runner.provider;
  const [bal, min] = await Promise.all([provider.getBalance(CONTRACT_ADDRESS), contract.minReward()]);
  $("rules").textContent = "Minimum reward " + ethers.formatEther(min) + " ETH. Held in escrow now: " + ethers.formatEther(bal) + " ETH.";
  render();
}

async function run(label, fn) {
  if (!contract) return toast("Connect MetaMask first.", "error");
  try {
    const tx = await fn();
    if (!tx) return;
    toast(label + ": sent, waiting for confirmation.", "info", tx.hash);
    const rc = await tx.wait();
    toast(label + ": confirmed in block " + rc.blockNumber + ".", "ok", tx.hash);
    await refresh();
  } catch (e) { toast(label + " failed: " + reason(e), "error"); console.error(e); }
}

const row = (role, ...btns) => h("div", { class: "role" }, h("span", {}, role), ...btns);

function card(r) {
  const id = r.id, st = Number(r.status);
  const act = (label, fn, cls = "") => h("button", { class: "btn small " + cls, onclick: () => run(label, fn) }, label);
  const rows = [];
  if (st === 0) rows.push(
    row("Anyone", act("I found it", () => {
      const note = prompt("Where is the item, and how can the owner collect it?");
      return note === null ? null : contract.claimFound(id, note);
    })),
    row("Reporter", act("Cancel and refund", () => contract.cancelReport(id))));
  if (st === 1) rows.push(
    row("Reporter", act("Confirm and pay", () => contract.confirmReturn(id), "primary"), act("Reject claim", () => contract.rejectClaim(id))),
    row("Finder", act("Withdraw claim", () => contract.withdrawClaim(id))),
    row("Admin", act("Pay finder", () => contract.resolveDispute(id, true)), act("Refund reporter", () => contract.resolveDispute(id, false))));
  const found = r.finder !== ethers.ZeroAddress;
  return h("article", { class: "flyer s-" + STATUS[st].toLowerCase() },
    h("div", { class: "body" },
      h("span", { class: "stamp" }, STATUS[st]),
      h("h3", {}, r.title),
      h("p", { class: "muted" }, "Last seen: " + (r.location || "not given")),
      r.description ? h("p", {}, r.description) : null,
      h("p", { class: "muted" }, "Posted by " + short(r.reporter) + (same(r.reporter, account) ? " (you)" : "") + ". Deadline " + new Date(Number(r.deadline) * 1000).toLocaleDateString() + "."),
      found ? h("p", {}, "Found by " + short(r.finder) + (same(r.finder, account) ? " (you)" : "") + ": " + r.claimNote) : null),
    h("div", { class: "tab" }, h("strong", { class: "reward" }, ethers.formatEther(r.reward) + " ETH"), ...rows));
}

function render() {
  const f = $("filter").value;
  const list = reports.filter((r) => f === "all" || Number(r.status) === Number(f));
  $("board").replaceChildren(...(list.length ? list.map(card) : [h("p", { class: "muted" }, "No reports here yet. Post the first one.")]));
}

$("reportForm").onsubmit = (e) => {
  e.preventDefault();
  if (!contract) return toast("Connect MetaMask first.", "error");
  let value, days;
  try { value = ethers.parseEther($("reward").value.trim()); days = BigInt($("days").value.trim()); }
  catch { return toast("Reward and days must be plain numbers.", "error"); }
  // No other checks here on purpose: the contract validates, so rejections show up in the UI.
  run("Post report", () => contract.reportLost($("title").value, $("location").value, $("description").value, days, { value }));
};
$("connectBtn").onclick = connect;
$("refreshBtn").onclick = () => contract ? refresh() : toast("Connect MetaMask first.", "error");
$("filter").onchange = render;
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}
