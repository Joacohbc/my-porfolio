export const prerender = false;

import type { APIRoute } from "astro";
import type { APIContext } from "astro";

const turnstileURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const turnstileRequest = async (secret: string, token: string, ip: string) => {
    const id = crypto.randomUUID();
    return await fetch(turnstileURL, {
        body: JSON.stringify({
            secret: secret,
            response: token,
            remoteip: ip,
            idempotency_key: id
        }),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
};

export const POST: APIRoute = async ({ request }: APIContext) => {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ message: "Invalid Request" }), { status: 400 });
    }

    const token = body?.token;
    if (!token) {
        return new Response(JSON.stringify({ message: "Missing token" }), { status: 400 });
    }

    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    const validResponse = new Response(JSON.stringify({
        message: "Error",
        response: {
            email: import.meta.env.EMAIL
        }
    }));

    try {
        const firstResult = await turnstileRequest(import.meta.env.TURNSTILE_SECRET_TOKEN, token, ip);
        const outcome = await firstResult.json();
        if (!outcome.success) {
            throw new Error('Verification failed');
        }
        return validResponse;
    } catch(e) {
        try {
            const secondResult = await turnstileRequest(import.meta.env.TURNSTILE_VISIBLE_SECRET_TOKEN, token, ip);
            const outcome = await secondResult.json();
            if (!outcome.success) {
                throw new Error('Verification failed');
            }
            return validResponse;
        } catch (e) {
            return new Response(JSON.stringify({
                message: "Error",
                response: {
                    message: "Error verifying you are human, please try again"
                }
            }));
        }
    }
};