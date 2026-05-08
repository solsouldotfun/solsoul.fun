FROM node:20-slim

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate

# Copy only the indexer package.json — no workspace lockfile or frontend files
# to avoid Railway vulnerability scanner flagging unrelated packages.
COPY package.json ./

# Install indexer dependencies
RUN pnpm install

# Copy indexer source and config (explicitly, to avoid copying node_modules/)
COPY src ./src
COPY tsconfig.json ./

# duration-sec=0 means run forever
CMD ["pnpm", "exec", "tsx", "src/main.ts", "--duration-sec", "0"]
