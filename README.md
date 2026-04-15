# Opencode Snapshot Builder

Builds a Daytona snapshot with a specific version of the [opencode](https://github.com/anomalyco/opencode) server.

## Setup

Copy `.env.example` to `.env` and fill in your keys:

```
cp .env.example .env
```

Required variables:

- `DAYTONA_API_KEY` — your Daytona API key
- `OPENAI_API_KEY` — passed into the sandbox so `opencode serve` can talk to OpenAI

Install dependencies for whichever script you want to use:

```bash
# Python
pip install daytona python-dotenv

# TypeScript
npm install
```

## Usage

Both scripts do the same thing — pick whichever language you prefer.

### Python

```bash
python build_snapshot.py                          # dev branch (default)
python build_snapshot.py migrate-web-to-nextjs    # specific branch
python build_snapshot.py d312c677c                # specific commit SHA
python build_snapshot.py dev my-prefix            # custom snapshot prefix
```

### TypeScript

```bash
npx tsx build_snapshot.ts                          # dev branch (default)
npx tsx build_snapshot.ts migrate-web-to-nextjs    # specific branch
npx tsx build_snapshot.ts d312c677c                # specific commit SHA
npx tsx build_snapshot.ts dev my-prefix            # custom snapshot prefix
```

The scripts will:
1. Create a Daytona snapshot that builds opencode from source at the given ref
2. Spin up a sandbox from that snapshot
3. Verify `opencode --version` and `opencode serve` health check
4. Stop and restart the sandbox, then re-verify the server
5. Clean up the sandbox and print the snapshot name

Then use the snapshot:

```bash
daytona create --snapshot <snapshot-name>
```
