::

  ZIP: unassigned
  Title: On-Chain Identity Registry for Short Addresses (zid)
  Owners: <your name/handle>
  Status: Draft
  Category: Standards Track
  Created: 2026-02-19
  License: MIT


Abstract
========

This ZIP proposes a protocol-level identity registry that maps short,
fixed-length identifiers ("zids") to full diversified transmission keys.
A zid is a 32-byte BLAKE3 hash of a diversified transmission key,
encoded in Bech32m with the human-readable prefix ``zid``. The registry
is maintained as part of consensus state, enabling any full node to
resolve a zid to its corresponding key without relying on external
infrastructure.


Motivation
==========

Zcash Unified Addresses (ZIP-316) are typically 141 or more characters.
While they serve their cryptographic purpose, they present significant
UX challenges:

- Too long to read aloud, transcribe, or verify visually
- Difficult to embed in physical media (business cards, signage)
- Substantially longer than addresses on other networks (Bitcoin: ~34,
  Ethereum: ~42 characters)

Additionally, post-quantum key encapsulation schemes such as ML-KEM-768
have public keys of 1,184 bytes, which would make future addresses even
longer. A short, stable pointer that decouples the human-facing
identifier from the underlying key material would future-proof the
addressing layer against cryptographic transitions.


Requirements
============

1. A zid MUST be derivable from the recipient's key material without
   any external input or coordination.

2. Resolution of a zid to a full key MUST be possible using only
   local consensus state (no external resolver or network request).

3. Registration MUST be permissionless (any user can register by
   including a registration action in a transaction).

4. Registration cost MUST be fixed (no auctions or fee markets).

5. The zid format MUST be compatible with the Unified Address
   typecode system (ZIP-316).

6. Older wallets that do not recognize zid typecodes MUST gracefully
   fall back to other receivers in the Unified Address.


Specification
=============

zid Derivation
--------------

A zid is computed as:

::

  zid = BLAKE3-256(dtk)

where ``dtk`` is the 43-byte diversified transmission key (as defined
in the Orchard protocol specification).

The resulting 32-byte hash is encoded using Bech32m (BIP-350) with the
human-readable prefix ``zid``, producing an identifier of approximately
56 characters::

  zid1q9gq6yskzdcjpqfp85kca2f0grarm7hxly5k8tc4gxed5vj0wdfq3


Identity Registry
-----------------

A new consensus state structure, the **Identity Registry**, is
introduced alongside the existing note commitment tree. The registry
is a key-value map:

::

  Registry: zid (32 bytes) → dtk (43 bytes)

Every full node maintains this registry as part of its chain state.

The registry is append-only with updates: a zid can be registered
once. Subsequent registrations of the same zid are rejected by
consensus.


Registration Action
-------------------

A new transaction action type, ``vRegister``, is introduced:

::

  RegistrationDesc {
    zid: [u8; 32],    // BLAKE3-256 hash of dtk
    dtk: [u8; 43],    // Full diversified transmission key
  }

A transaction MAY contain zero or more ``RegistrationDesc`` entries
in its ``vRegister`` field.

Consensus rules for ``vRegister``:

1. ``BLAKE3-256(dtk) == zid`` MUST hold.
2. ``zid`` MUST NOT already exist in the Identity Registry.
3. The transaction MUST pay a fixed registration fee of
   ``REGISTRATION_FEE`` zatoshis (value TBD, suggested: 100,000
   zatoshis = 0.001 ZEC).
4. The registration fee is added to the miner/block reward.


Unified Address Integration
---------------------------

A new typecode is assigned for zid receivers within Unified Addresses
(ZIP-316):

::

  Typecode 0x04: zid receiver (32 bytes)

A Unified Address MAY contain a zid receiver alongside other receiver
types. When a sending wallet encounters a UA containing a zid receiver:

1. If the wallet supports zid resolution, it looks up ``zid → dtk``
   in its local chain state, verifies ``BLAKE3-256(dtk) == zid``,
   and uses the ``dtk`` to construct the Orchard payment.

2. If the wallet does not support zid resolution, it ignores the
   ``0x04`` typecode and falls back to the next supported receiver
   (e.g., Orchard ``0x03``, Sapling ``0x02``), per ZIP-316 rules.


Light Client Considerations
---------------------------

Light clients (e.g., those using ``lightwalletd``) do not maintain
full consensus state. Two approaches for zid resolution by light
clients are considered:

1. **Full registry sync**: The light client downloads the complete
   Identity Registry (~75 bytes per entry; ~75 MB for 1 million
   users). This is feasible on modern mobile devices and enables
   fully local resolution with no privacy leak.

2. **On-demand query**: The light client queries a ``lightwalletd``
   server for a specific zid. This leaks the queried zid to the
   server. Future work on Private Information Retrieval (PIR) could
   mitigate this leak.

The recommended approach for initial deployment is (1), with (2)
available as a fallback for resource-constrained clients.


Privacy Considerations
======================

This section requires further community review.

Registration Privacy
--------------------

A ``vRegister`` action publicly associates a zid with a diversified
transmission key. This reveals:

- That a specific key has been registered
- The block height at which registration occurred

It does NOT reveal who controls the key (the transaction funding the
registration can originate from shielded inputs).

Mitigations to consider:

- Batching registrations (wallets delay registration by a random
  number of blocks)
- Decoy registrations (register multiple zids, only use one)

Payment Privacy
---------------

Payments to a zid are standard Orchard shielded transactions. The zid
is used only for client-side key resolution and NEVER appears in the
payment transaction on-chain. Payment privacy is identical to current
Orchard transactions.

Resolution Privacy
------------------

For full nodes and light clients that sync the full registry,
resolution is entirely local. No privacy leak occurs.

For light clients using on-demand queries, the queried zid is visible
to the ``lightwalletd`` server. This is analogous to the privacy leak
in current name-resolution systems (e.g., DNS, ENS). PIR-based
resolution is left as future work.

Loss of Diversified Addresses
-----------------------------

If a user shares a single zid with multiple counterparties, those
counterparties can determine that they are paying the same recipient
(by comparing zids). This is a reduction in privacy compared to the
current practice of using diversified addresses.

Users who require counterparty unlinkability can:

- Register multiple zids (each derived from a different diversified
  transmission key)
- Share the full Unified Address instead of a zid
- Use separate wallets


Security Considerations
=======================

Hash Collision Resistance
-------------------------

BLAKE3-256 provides 128-bit collision resistance. An attacker would
need approximately 2^128 operations to find two keys that hash to the
same zid. This is considered computationally infeasible for the
foreseeable future, including against quantum adversaries using
Grover's algorithm (which reduces the search space to 2^128 for
preimage attacks on a 256-bit hash).

Registry Spam
-------------

An attacker could register many zids to inflate the registry size.
The fixed registration fee (0.001 ZEC) provides economic deterrence:
registering 1 million fake zids would cost 1,000 ZEC. The fee may
be adjusted via future consensus changes if spam becomes problematic.

Key-zid Binding
---------------

Consensus validation ensures ``BLAKE3-256(dtk) == zid`` for every
registration. An attacker cannot register a zid that does not
correspond to the provided key.


Deployment
==========

This ZIP would activate as part of a future Network Upgrade (NU).

The activation plan includes:

1. Pre-activation: wallet developers add zid encoding/decoding and
   registry sync support
2. Activation height: ``vRegister`` actions become valid; Identity
   Registry begins accumulating entries
3. Post-activation: wallets progressively enable zid as default
   sharing format


Reference Implementation
=========================

TODO: Reference implementation in ``librustzcash`` and ``zebra``.


References
==========

- ZIP-316: Unified Addresses and Unified Viewing Keys
  (https://zips.z.cash/zip-0316)
- BIP-350: Bech32m format for v1+ witness addresses
  (https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki)
- BLAKE3 hash function (https://github.com/BLAKE3-team/BLAKE3)
- zkDragon, "How We Go Post-Quantum Private" (2026)
- Henzinger et al., "One Server for the Price of Two: Simple and
  Fast Single-Server Private Information Retrieval" (2022)
