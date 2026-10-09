import 'dotenv/config';
import { verifyNetwork, publicClient } from './network.js';

try {
  const network = await verifyNetwork();
  const blockNumber = await publicClient.getBlockNumber();

  console.log('Network verified:', network.network);
  console.log('Chain ID:', network.chainId);
  console.log('Latest block:', blockNumber.toString());
} catch (error) {
  console.error('Network test failed:', error.message);
  process.exitCode = 1;
}
