# Isolated installation check

This checks the packaged node in n8n 2.40.7, using its official pinned container
image (Node 26.7.0). It imports the packaged consumption example, executes it
twice through separate n8n CLI processes and verifies a single write and a
recovered receipt. Exported node definitions must include both DontWaste nodes.

Prepare a temporary build context containing these files, the reviewed
`n8n-nodes-dontwaste-1.0.0.tgz`, and a one-day self-signed TLS fixture:

```sh
mkdir tls
openssl req -x509 -newkey rsa:2048 -nodes -keyout tls/key.pem -out tls/cert.pem \
  -days 1 -subj '/CN=cloud.dontwaste.app' \
  -addext 'subjectAltName=DNS:cloud.dontwaste.app'
docker build -t dontwaste-n8n-installation-test .
docker run --name dontwaste-n8n-installation-test --network none \
  --add-host cloud.dontwaste.app:127.0.0.1 --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 256 --memory 1536m --cpus 1 \
  dontwaste-n8n-installation-test
```

Image construction downloads package dependencies. Execution has no network,
ports, production credentials or host mounts. The fixed DontWaste hostname
resolves only to the fixture inside that container. TLS verification remains
enabled with the test certificate. Logs in `/tmp` contain only fixture data.
Delete the named test container when finished; keep the resulting PASS record.

The n8n `--file` execution flag is deprecated; this check imports the workflow and
uses its ID. A zero CLI exit alone is insufficient: the test checks the recorded
HTTP requests, stored result and receipt recovery.

This is an installation/runtime check against an HTTPS fixture, separate from
the integration server's real PostgreSQL tests. It does not establish acceptance
of a user's n8n installation or prove downstream trigger delivery after restart.
Manual installation follows the
[n8n community-node instructions](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation/).
