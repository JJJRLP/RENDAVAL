# Hackathon form: text to paste

Aligned with the product in `main`. Replace any field that says something different. Fill in the [brackets].

## Project name
Rendaval

## One-liner
Companies borrow USDC against their tokenized bonds on Stellar without selling them; if they default, the bonds go only to a buyer the issuer approved.

## Description
Rendaval lets verified companies (KYB with Didit) deposit tokenized bonds into a Soroban vault created for each loan and receive USDC. The lender's USDC is protected by a Trustless Work escrow until the bonds are in the vault. When the company repays, all its bonds are released in the same transaction. With accumulating bonds such as Etherfuse's tokenized CETES, the yield keeps adding to the token's value inside the vault, so the company keeps it.

## Problem
Companies that hold tokenized government bonds and need dollars for a few weeks today have to sell: they pay the currency conversion and lose the bond's yield. Stellar holds about $3.56B in tokenized RWAs, but only 0.1% is used in lending, because issuer controls (holder authorization, freeze) block the open liquidations that DeFi lending needs (RedStone, "Next Phase for RWAs on Stellar", 2026).

## Solution
- **Vault per loan:** bonds stay in a contract that only releases them on repayment, on a closed sale, or 180 days after default.
- **Issuer rules:** the issuer authorizes the company, the vault and the buyer; the vault cannot be revoked while there is debt.
- **Price:** published by the issuer in the loan book, readable with Stellar's SEP-40 standard. Margin warning at 70% debt-to-value, default at 85% or after the due date.
- **Default:** after a short cure window, the bonds are sold to a buyer approved by the issuer at a 5% discount. The lender is paid first and any surplus goes to the company. If no sale happens within 180 days, the bonds go to the lender (write-off).

## Where we start
Mexico City (tokenized CETES from Etherfuse, already on Stellar), then Brazil (tokenized TESOURO). The app supports companies from other countries.

## First customer type
Mid-size and large companies in Mexico that hold tokenized CETES in their treasury and need short-term dollars, reached through treasury platforms such as Bando.

## Potential customers
Initial asset base: $490M in tokenized non-US government debt on Stellar, led by Etherfuse's CETES (Mexico) and TESOURO (Brazil) (Stellar Development Foundation, Aug 2026). Candidate companies: [number from interviews and waitlist]. We do not count wallets as customers.

## Business model
A spread between the company's rate and the lender's yield (working assumption: 8% vs 6%, so 2% a year on the loan balance). Each $1M of average balance earns $20,000 a year; covering $1M of yearly costs needs about $50M of average balance (around 200 loans of $250k at a time). Figures are assumptions to validate in the pilot. See `docs/modelo-y-prestamistas.md`.

## Lender side
Today a single test lender signs on the server. In production, qualified and institutional USDC holders would pass KYB or KYC with Didit and fund loans from their own Stellar account (Pollar or institutional custody). In Mexico lending would go through a SOFOM, our own or a partner's.

## Stage
Public prototype on Stellar testnet: full loan cycle verified on chain (deposit, disbursement, margin warning, repayment with all bonds returned, and a closed sale on default). Test assets only; no real money.

## Traction and links
- Live demo: https://vault-mvp-kappa.vercel.app
- Repository: https://github.com/JJJRLP/RENDAVAL
- Loan book contract (testnet): https://stellar.expert/explorer/testnet/contract/CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN
- Repayment with all bonds returned: https://stellar.expert/explorer/testnet/tx/f64d26a082aa802a3ecb45b34d7af751bb86fec87465bd967dd8be0f1e222a55
- Closed sale on default, surplus to the company: https://stellar.expert/explorer/testnet/tx/577997a1756a68d4a58827328f0b42bf0c68f11fddceffe1fa0f4ef4163b098d
- Demo video: [link]

## Team
[Names, roles, GitHub and LinkedIn]
