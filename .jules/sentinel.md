## Sentinel Journal

## 2025-02-18 - Ignored Security Verification Result
**Vulnerability:** CAPTCHA verification (Cloudflare Turnstile) was bypassed because the code awaited the response parsing but ignored the `success` boolean in the result.
**Learning:** Checking for the existence of a response or a successful HTTP status code is not enough; the specific success field in the API response payload must be validated.
**Prevention:** Always verify the explicit success condition of security APIs and fail closed (throw error) if the condition is not met.
