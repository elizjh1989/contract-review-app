# Contract Review App

A simple contract review prototype built with plain HTML, CSS and JavaScript (no frameworks, no build step).
Upload a PDF contract, read it on the left, and ask questions about it in the chat on the right.
Answers come from an n8n workflow and include the supporting contract clauses.

## Features

- **Two-column layout:** contract preview on the left, chat on the right, each scrolling independently
- **PDF upload:** drag and drop or browse, with zoom controls (50%–200%) and a replace/remove option
- **Chat with your contract:** sends the uploaded PDF and your question to an n8n webhook
- **Cited answers:** shows the answer, the contract clauses that support it, and a short reasoning note
- **Suggested questions** to get started, a typing indicator, and clear error messages

## Run it locally

1. Clone or download this repository.
2. Copy `config.example.js` to `config.js` and replace the placeholder with your own n8n webhook URL:

   ```js
   window.APP_CONFIG = {
     WEBHOOK_URL: "https://your-instance.app.n8n.cloud/webhook/your-unique-id",
   };
   ```

   `config.js` is listed in `.gitignore`, so your URL is never committed.
3. Open `index.html` in a browser (Chrome or Edge recommended for the built-in PDF viewer).
4. Upload a contract PDF, type a question and click **Send**.

## n8n webhook requirements

The webhook node must:

- accept **POST** requests with multipart form data: the PDF in a field named `file` and the question in `message`
- allow cross-origin requests (**Allowed Origins (CORS)** set to `*`, or your site's address)
- respond (via a Respond to Webhook node) with JSON only, in exactly this shape:

  ```json
  {
    "response": "final answer based only on the contract",
    "citation": ["exact clause text with its section or page"],
    "reasoning": "1-2 sentences on how the citations support the response"
  }
  ```

If the contract doesn't contain the answer, `response` is "This information is not mentioned in the contract.", `citation` is `[]` and `reasoning` is `""`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Navy and orange styling |
| `app.js` | Upload, PDF preview, zoom and webhook chat logic |
| `config.example.js` | Template for your private `config.js` |
