export const prerender = false;

import type { APIRoute } from "astro";
import type { APIContext } from "astro";

const turnstileURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const POST: APIRoute = async ({ request }: APIContext) => {
    const body = await request.json()
    const token = body.token;
    const ip = request.headers.get('CF-Connecting-IP');

    const id = crypto.randomUUID();
    const firstResult = await fetch(turnstileURL, {
        body: JSON.stringify({
            secret: import.meta.env.TURNSTILE_SECRET_TOKEN,
            response: token,
            remoteip: ip,
            idempotency_key: id
        }),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    try {
        const firstOutcome = await firstResult.json();
        return new Response(
            JSON.stringify({
                message: "Success",
                response: {
                    email: import.meta.env.EMAIL
                }
            })
        )
    } catch(e) {
        return new Response(
            JSON.stringify({
                message: "Error",
                response: {
                    message: "Error verifying you are human, please try again"
                }
            })
        )
    }
};