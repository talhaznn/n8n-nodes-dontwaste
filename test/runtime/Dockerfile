FROM docker.n8n.io/n8nio/n8n@sha256:ffeb52485f78b1b06c9a832205853cf75da72a07a514c9a27724df85979d6c34
USER node
COPY --chown=node:node n8n-nodes-dontwaste-1.0.0.tgz /tmp/dontwaste.tgz
RUN mkdir -p /home/node/.n8n/nodes && cd /home/node/.n8n/nodes && npm install --ignore-scripts --omit=dev /tmp/dontwaste.tgz
COPY --chown=node:node *.cjs /qa/
COPY --chown=node:node tls /qa/tls
ENTRYPOINT ["node", "/qa/run.cjs"]
