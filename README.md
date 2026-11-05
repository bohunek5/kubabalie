# Suwalska Strefa Ciepła — protected project preview

Published at https://bohunek5.github.io/kubabalie/

The website and configurators are encrypted in `app.encrypted.json`. Public files contain only the access gate, third-party libraries, fonts and imagery. The previous, original configurator is protected by the same gate at `oryginalny-konfigurator/`.

`source.encrypted.json` contains the complete working-project source, including the local Node server, tests, export scripts and assets. Databases, personal order/inquiry records, environment files, working artifacts and credentials are excluded. The archive is AES-256-GCM with PBKDF2-SHA-256 (600000 iterations); the authentication data is the UTF-8 envelope format. After decrypting, gunzip the bytes and read the JSON `files` map: each file has Base64 content and a SHA-256 checksum. A restoration utility is included in the working project as `scripts/restore-github-source.mjs`.

GitHub Pages runs the frontend only. Checkout stores demonstration drafts in the visitor’s browser and does not send orders or take payment. The contact form downloads a text inquiry and does not send messages. The full local project retains its Node/SQLite workflow.

No access password is stored in this repository.
