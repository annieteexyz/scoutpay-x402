import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createWalletClient,
  http,
  defineChain,
  isAddress,
  getAddress
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { requestScoutQuote } from './agent.js';
import { parsePaymentRequirements } from './payment.js';
import { verifyNetwork, publicClient } from './network.js';

const SCOUT_URL =
  'https://api.a2a.family/a/scout/v1/grade_launches';

const TOKEN = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

const EXPECTED_RECIPIENT =
  '0x0a64498810C29C3Ac3b9557940b70A095dc745D9';

const chain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [process.env.RPC_URL]
    }
  }
});

function extractTransactionHash(data, headers) {
  const candidates = [
    data?.transaction,
    data?.txHash,
    data?.transactionHash,
    data?.settlement?.transaction,
    data?.payment?.transaction
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' &&
        /^0x[a-fA-F0-9]{64}$/.test(candidate)) {
      return candidate;
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'x-payment-response') {
      try {
        const decoded = JSON.parse(
          Buffer.from(value, 'base64').toString('utf8')
        );

        const hash =
          decoded.transaction ||
          decoded.txHash ||
          decoded.transactionHash;

        if (typeof hash === 'string' &&
            /^0x[a-fA-F0-9]{64}$/.test(hash)) {
          return hash;
        }
      } catch {
        // Leave unrecognized payment-response headers untouched.
      }
    }
  }

  return null;
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error(
      'PRIVATE_KEY is missing from your local .env file.'
    );
  }

  if (!process.env.RPC_URL) {
    throw new Error('RPC_URL is missing from .env.');
  }

  const privateKey = process.env.PRIVATE_KEY;

  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('PRIVATE_KEY format is invalid.');
  }

  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(process.env.RPC_URL)
  });

  const network = await verifyNetwork();

  console.log('\nScoutPay — Paid Scout Agent Call');
  console.log('Network:', network.network);
  console.log('Chain ID:', network.chainId);
  console.log('Wallet:', account.address);

  const balance = await publicClient.readContract({
    address: TOKEN,
    abi: [{
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }]
    }],
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log('USDG balance:', (Number(balance) / 1e6).toFixed(6));

  if (balance < 10000n) {
    throw new Error('Insufficient USDG for the quoted 0.01 USDG payment.');
  }

  const quoteResponse = await requestScoutQuote(1);

  if (quoteResponse.status !== 402) {
    throw new Error(
      `Expected HTTP 402 before payment; received ${quoteResponse.status}.`
    );
  }

  const quote = parsePaymentRequirements(quoteResponse.data);

  if (
    quote.chainId !== 4663 ||
    quote.token.toLowerCase() !== TOKEN.toLowerCase() ||
    quote.recipient.toLowerCase() !== EXPECTED_RECIPIENT.toLowerCase() ||
    quote.amountBaseUnits !== '10000'
  ) {
    throw new Error(
      'Payment quote failed the safety checks. No payment was made.'
    );
  }

  console.log('\nScout requires:', quote.amountUSDG, 'USDG');
  console.log('Recipient:', getAddress(quote.recipient));
  console.log('Token:', getAddress(quote.token));
  console.log('Resource:', quote.resource);

  console.log(
    '\nThis next step will sign a payment authorization. ' +
    'Scout’s payment facilitator may submit it for settlement.'
  );

  const readline = await import('node:readline/promises');
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await terminal.question(
    '\nType PAY 0.01 USDG to authorize this attempt: '
  );

  terminal.close();

  if (confirmation !== 'PAY 0.01 USDG') {
    console.log('Cancelled. No payment authorization was signed.');
    return;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const authorization = {
    from: account.address,
    to: getAddress(quote.recipient),
    value: BigInt(quote.amountBaseUnits),
    validAfter: 0n,
    validBefore: now + 120n,
    nonce: `0x${randomBytes(32).toString('hex')}`
  };

  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: 'Global Dollar',
      version: '1',
      chainId: 4663,
      verifyingContract: getAddress(quote.token)
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    },
    primaryType: 'TransferWithAuthorization',
    message: authorization
  });

  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'robinhood',
    payload: {
      signature,
      authorization: {
        ...authorization,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString()
      }
    }
  };

  const paymentHeader = Buffer
    .from(JSON.stringify(paymentPayload))
    .toString('base64');
const response = await fetch(quote.resource, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-PAYMENT': paymentHeader
    },
    body: JSON.stringify({ n: 1 })
  });

  const headers = Object.fromEntries(response.headers.entries());
  const rawBody = await response.text();

  let result;

  try {
    result = JSON.parse(rawBody);
  } catch {
    result = { rawResponse: rawBody };
  }

  const transactionHash = extractTransactionHash(result, headers);

  console.log('\nScout HTTP status:', response.status);
  console.log('Scout response:', JSON.stringify(result, null, 2));

  if (transactionHash) {
    console.log('Payment transaction:', transactionHash);
    console.log(
      'Explorer:',
      `https://robinhoodchain.blockscout.com/tx/${transactionHash}`
    );
  }

  await mkdir('evidence', { recursive: true });

  const evidence = {
    project: 'ScoutPay',
    agent: 'Scout',
    skill: 'grade_launches',
    network: 'Robinhood Chain',
    chainId: 4663,
    wallet: account.address,
    requestedLaunches: 1,
    quotedAmount: quote.amountUSDG,
    token: quote.token,
    recipient: quote.recipient,
    httpStatus: response.status,
    transactionHash,
    response: result,
    timestamp: new Date().toISOString()
  };

  const filename = path.join(
    'evidence',
    `scout-call-${Date.now()}.json`
  );

  await writeFile(filename, JSON.stringify(evidence, null, 2));

  console.log('Evidence saved to:', filename);

  if (response.ok && transactionHash) {
    console.log('\nSUCCESS: Scout returned a response and a transaction hash.');
  } else if (response.ok) {
    console.log(
      '\nScout returned a successful HTTP response, but a transaction ' +
      'hash was not detected. Verify settlement before submitting.'
    );
  } else {
    console.log(
      '\nThe call did not succeed. Check the response before retrying; ' +
      'do not repeatedly sign payment authorizations.'
    );
  }
}

main().catch((error) => {
  console.error('\nScoutPay error:', error.message);
  process.exitCode = 1;
});