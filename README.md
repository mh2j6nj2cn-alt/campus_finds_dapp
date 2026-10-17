# Campus Finds: lost-and-found with reward escrow

Blockchain Technology (CSE4444), Assignment 2.

## Problem

Lost items on campus are posted on WhatsApp groups and notice boards. Finders have no reason to return them, and owners who promise a reward can refuse to pay afterwards. Campus Finds locks the reward in a smart contract when the owner posts the report. A finder claims the item, and the contract pays them only when the owner confirms the return. If the two sides disagree, the admin (the deployer) settles it.

## Files

- `contracts/CampusFinds.sol`: Solidity contract (constructor, state variables, events, modifiers, validation)
- `frontend/`: `index.html`, `style.css`, `app.js`, `config.js` (Ethers.js v6 with MetaMask)
- `screenshots/`: evidence images (see the checklist below)

## Run it

1. Open [Remix](https://remix.ethereum.org), create `CampusFinds.sol`, paste the contract, and compile with Solidity 0.8.20 or newer.
2. In Deploy & Run, choose **Dev - Ganache Provider** or **Injected Provider - MetaMask** on Sepolia. Enter `1000000000000000` (0.001 ETH in wei) as the constructor argument and deploy.
3. Copy the deployed address into `frontend/config.js`.
4. Serve the frontend. MetaMask does not work from `file://`, so run `python -m http.server 8000` inside `frontend/` and open `http://localhost:8000`.

## Connect MetaMask

1. Switch MetaMask to the same network you deployed to (for Ganache, add the RPC `http://127.0.0.1:7545` and import a Ganache private key into MetaMask; never commit it).
2. Click **Connect MetaMask** and approve. The header shows your address, the chain ID, and "(admin)" for the deployer.
3. Post a report, then switch accounts in MetaMask to act as the finder. The page reloads on account change.

## Deployment details

- Network: `<Ganache or Sepolia>`
- Contract address: `<0x...>`
- Deployer / admin: `<0x...>`
- Deployment transaction: `<hash>`

## Test cases

Accounts: A = reporter, B = finder, C = admin (deployer). Minimum reward is 0.001 ETH. Fill the last column after you run each case.

| # | Type | Action | Expected result | Observed |
|---|------|--------|-----------------|----------|
| V1 | Valid | A posts "Blue calculator", 0.01 ETH, 14 days | `ReportCreated`, `reportCount` = 1, escrow = 0.01 ETH | |
| V2 | Valid | B claims report 1 with a note | Status Claimed, `ItemFound` | |
| V3 | Valid | A confirms return | Status Returned, B receives 0.01 ETH, escrow = 0 | |
| V4 | Valid | A posts, then cancels | Status Cancelled, A refunded | |
| V5 | Valid | B claims, A rejects (or B withdraws) | Status Open, finder cleared | |
| V6 | Valid | B claims, C resolves with `payFinder` true or false | B or A receives the reward | |
| I1 | Invalid | Post with reward 0.0001 ETH | Reverts: Reward below minimum | |
| I2 | Invalid | Post with an empty title | Reverts: Title must be 1-80 characters | |
| I3 | Invalid | Post with 0 days (or 100 days) | Reverts: Duration must be 1-90 days | |
| I4 | Invalid | Claim with an empty note | Reverts: Note must be 1-200 characters | |
| I5 | Invalid | Claim report 999 | Reverts: Report does not exist | |
| I6 | Invalid | Claim a report that is already claimed | Reverts: Report is not open | |
| I7 | Invalid | Confirm return on an open report | Reverts: Report is not claimed | |
| I8 | Invalid | Deploy with constructor argument 0 | Reverts: Minimum reward must be positive | |
| U1 | Unauthorised | A claims own report | Reverts: Reporter cannot claim own item | |
| U2 | Unauthorised | B confirms return | Reverts: Only the reporter | |
| U3 | Unauthorised | B cancels A's report | Reverts: Only the reporter | |
| U4 | Unauthorised | A or B calls `resolveDispute` | Reverts: Only admin | |
| U5 | Unauthorised | A (not the finder) calls `withdrawClaim` | Reverts: Only the finder | |

The frontend does not pre-check these inputs and shows every action button for the current status, so the contract's rejections appear in the page as red messages. For an on-chain failed transaction, use Remix: when gas estimation fails it asks whether to send anyway, and the mined failure appears in the Remix console.

## Screenshots

Save these in `screenshots/` and link them here:

- `01-compile.png`: compilation
- `02-deploy.png`: deployment
- `03-metamask-connected.png`: wallet connected
- `04-success-tx.png`: successful transaction
- `05-failed-tx.png`: failed transaction
- `06-ui-data.png`: blockchain data shown in the UI

## Security notes

- The reward is paid with a checks-effects-interactions pattern and a reentrancy guard.
- The contract has no payable fallback, so stray ETH is rejected.
- The frontend writes on-chain text with text nodes only, which prevents HTML injection.
- Known limitation: a reporter can reject honest claims repeatedly. The admin can only settle claims that are currently Claimed.
- No private keys, seed phrases, or passwords are stored in this repository.
