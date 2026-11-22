# Hackathon form — replacement copy

## One-liner

USDC loans for companies, secured by tokenized bonds that remain locked under the issuer's holder rules.

## Description

Rendaval is a public prototype on Stellar testnet. A verified company declares tokenized bonds, deposits test assets into a vault created for one loan, and receives test USDC. Repayment returns all bonds in the same transaction. If the loan defaults, an issuer-approved buyer pays and receives the pledged bonds atomically; the lender is paid first and any surplus goes to the company.

The company side uses Pollar for access and transaction signing and Didit sandbox for KYB. The lender side is simulated: one test lender signs with a server-held test key. All assets have no real value.

## Solution

Rendaval makes permissioned tokenized bonds usable as collateral without pretending they can be sold to any wallet. The issuer approves every holder, including each loan vault and any buyer. The issuer cannot withdraw or revoke pledged collateral while the debt is open. Each loan has its own bond vault; disbursement, repayment, and default sale follow rules enforced by Soroban contracts.

## Where we start

Mexico City, Mexico, is the first market. Brazil is second. The product is designed for companies from any country.

## First niche

Companies holding tokenized Mexican government debt that need short-term dollar liquidity and for which selling or redeeming the position costs more than a 30-day loan. Etherfuse's tokenized CETES on Stellar are the first candidate collateral for a pilot, but there is no agreement with Etherfuse.

## First customer type

A Mexican fintech or operating company with a corporate treasury, tokenized bonds, a verified legal entity, and a recurring short-term need for USDC.

## Potential customers

Our working order-of-magnitude estimate is tens to hundreds of candidate companies in the initial reachable niche, counted as companies rather than wallets. This is a hypothesis to validate through issuer and treasury interviews, not a measured market size or a customer pipeline.

## Stage

Public prototype on testnet. The contracts and end-to-end flows are deployed with test assets; no real-value pilot is live.

## Revenue model and price

Design only; not implemented. The company would pay 8% per year, the lender would receive about 6%, and Rendaval would keep a two-percentage-point spread. At USD 50 million in average outstanding loans, that spread would be about USD 1 million per year. Today the contract charges no fee for Rendaval and the full 8% goes to the test lender. Trustless Work deducts a separate 0.3% disbursement fee in the prototype.

## Traction

On-chain testnet activity, not commercial traction: the repository links the deployed [loan book](https://stellar.expert/explorer/testnet/contract/CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN), a [repayment that returned all bonds](https://stellar.expert/explorer/testnet/tx/f64d26a082aa802a3ecb45b34d7af751bb86fec87465bd967dd8be0f1e222a55), and an [atomic default sale](https://stellar.expert/explorer/testnet/tx/577997a1756a68d4a58827328f0b42bf0c68f11fddceffe1fa0f4ef4163b098d). We have no customers yet and claim no customer, issuer, or partner agreement.

## Competitors

Blend RWA pools and Templar address adjacent on-chain lending use cases. Rendaval's difference is its permissioned-bond flow: the issuer approves every holder but cannot touch pledged collateral; bonds are held in a separate vault for each loan; repayment returns the bonds atomically; and a default sale atomically exchanges buyer payment for the bonds. This comparison should be rechecked against each competitor's current primary documentation before submission.

## Repository

https://github.com/JJJRLP/RENDAVAL

## Demo

https://vault-mvp-kappa.vercel.app

