# Reading the synthetic change report

API Contract Guard makes five supported categories of OpenAPI breaking change visible before a consumer integrates an updated contract. It is a bounded local TypeScript comparator, not a general compatibility certificate.

Run `npm ci --ignore-scripts` and `npm run demo` with Node 24.15.0 and npm 11.18.0. The demo removes `GET /orders`; the report identifies `OPERATION_REMOVED` and a synthetic consumer annotation. The comparator exits 2 for that expected finding, while the demonstration wrapper exits 0 after checking it. Exit 3 means invalid or unsupported input and produces no report; exit 0 means no supported change was found.

The HTML report is static. Its change table can be focused and scrolled with a keyboard on narrow screens. Unsupported shapes fail closed, so an unsupported document is never a compatibility approval. No customer traffic, clients or usage results are claimed.

## My role

I use AI extensively to build these projects. I understand and review the code, and I am still learning to write it independently.
