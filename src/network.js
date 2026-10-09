import 'dotenv/config';
import { createPublicClient, defineChain, http } from 'viem';

const rpcUrl = process.env.RPC_URL;

if (!rpcUrl) {
  throw new Error(
    'RPC_URL is missing. Configure it in your local .env file.'
  );
}

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [rpcUrl]
    }
  }
});

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(rpcUrl)
});

export async function verifyNetwork() {
  const chainId = await publicClient.getChainId();

  if (chainId !== 4663) {
    throw new Error(
      `Wrong network: expected chain ID 4663, received ${chainId}.`
    );
  }

  return {
    chainId,
    network: 'Robinhood Chain'
  };
}
