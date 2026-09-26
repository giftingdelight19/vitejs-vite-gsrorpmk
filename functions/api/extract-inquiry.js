export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const workerUrl =
      "https://vitejs-vite-gsrorpmk.giftingdelight19.workers.dev/api/extract-inquiry";

    const workerRequest = new Request(workerUrl, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    return await fetch(workerRequest);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Unable to contact the AI extraction service.",
        details: error?.message || String(error),
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
