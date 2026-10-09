const SCOUT_URL =
  'https://api.a2a.family/a/scout/v1/grade_launches';

export async function requestScoutQuote(numberOfLaunches = 1) {
  if (
    !Number.isInteger(numberOfLaunches) ||
    numberOfLaunches < 1 ||
    numberOfLaunches > 12
  ) {
    throw new Error('Choose between 1 and 12 launches.');
  }

  const response = await fetch(SCOUT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ n: numberOfLaunches })
  });

  const headers = Object.fromEntries(response.headers.entries());
  const body = await response.text();

  let data;

  try {
    data = JSON.parse(body);
  } catch {
    data = { rawResponse: body };
  }

  return {
    status: response.status,
    headers,
    data
  };
}
