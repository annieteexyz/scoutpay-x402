const EXPECTED_CHAIN_ID = 4663;

const EXPECTED_RECIPIENT =
  '0x0a64498810C29C3Ac3b9557940b70A095dc745D9';

const EXPECTED_USDG =
  '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

const MAX_USDG_BASE_UNITS = 10000n;

export function parsePaymentRequirements(responseData) {
  const requirements =
    typeof responseData === 'string'
      ? JSON.parse(responseData)
      : responseData;

  if (!Array.isArray(requirements?.accepts)) {
    throw new Error('No payment options found in Scout response.');
  }

  const option = requirements.accepts.find((item) =>
    item.scheme === 'exact' &&
    item.network === 'robinhood' &&
    item.asset?.toLowerCase() === EXPECTED_USDG.toLowerCase() &&
    item.payTo?.toLowerCase() === EXPECTED_RECIPIENT.toLowerCase() &&
    Number(item.extra?.chainId) === EXPECTED_CHAIN_ID &&
    item.extra?.symbol === 'USDG'
  );

  if (!option) {
    throw new Error('No matching USDG payment option found.');
  }

  const amount = BigInt(option.maxAmountRequired);

  if (amount <= 0n || amount > MAX_USDG_BASE_UNITS) {
    throw new Error(
      'Payment exceeds ScoutPay’s 0.01 USDG safety limit.'
    );
  }

  return {
    scheme: option.scheme,
    network: option.network,
    chainId: EXPECTED_CHAIN_ID,
    token: option.asset,
    recipient: option.payTo,
    amountBaseUnits: amount.toString(),
    amountUSDG: (Number(amount) / 1_000_000).toFixed(6),
    resource: option.resource,
    description: option.description
  };
}
