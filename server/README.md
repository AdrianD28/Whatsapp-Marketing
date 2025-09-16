Static upload server

- Start: `npm run serve-static`
- Upload endpoint: `POST /upload` with form field `file` (multipart/form-data)
- Files are served under `/static/<filename>` on the same host:port

If Meta needs to fetch the uploaded image (for template header_handle via URL), your local server must be accessible from the public internet. Use a tool like `ngrok` to expose the port:

1) Start server: `npm run serve-static`
2) In another terminal run (PowerShell):
   ngrok http 5174
3) Use the generated `https://...` URL + `/static/<filename>` as the `headerValue` or as the uploaded URL returned by `/upload`.

Note: For production you need a proper public host; this server is a quick local helper for development/testing only.
