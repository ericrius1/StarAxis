/**
 * Cloudflare Worker entry for the static Star Axis experience.
 * Assets are emitted by Vite and exposed through Sites' ASSETS binding.
 */
const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') return response;

    const fallback = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(fallback, request));
  },
};

export default worker;
