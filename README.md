# Suwalska Strefa Ciepła — protected project preview

Published at https://bohunek5.github.io/kubabalie/

The website and configurators are encrypted in `app.encrypted.json`. Public files contain only the access gate, third-party libraries, fonts and imagery. The previous, original configurator is protected by the same gate at `oryginalny-konfigurator/`.

`source.encrypted.json` contains the encrypted complete working-project source or an index of its encrypted parts, including the local Node server, tests, export scripts and all assets. Databases, personal order/inquiry records, environment files, working artifacts and credentials are excluded. The archive is AES-256-GCM with PBKDF2-SHA-256 (600000 iterations); the authentication data is the UTF-8 envelope format. After decrypting, gunzip the bytes and read the JSON `files` map: each file has Base64 content and a SHA-256 checksum. Archives above 80 MiB use an index with format `ssc-source-parts-v1` and adjacent `source.encrypted.part-01`, `source.encrypted.part-02`, etc. Each part is at most 64 MiB and contains raw bytes of the original encrypted JSON envelope, not plaintext. Download the index and every listed part into the same directory. The index records each part size and SHA-256 plus the total size and SHA-256 of the reassembled envelope. The restore utility verifies all of them before decryption and also accepts older single-file archives. A restoration utility is included in the working project as `scripts/restore-github-source.mjs`.

GitHub Pages runs the frontend only. Checkout stores demonstration drafts in the visitor’s browser and does not send orders or take payment. The contact form downloads a text inquiry and does not send messages. The full local project retains its Node/SQLite workflow.

No access password is stored in this repository.
