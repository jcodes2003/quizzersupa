# Java Runner Service

Small standalone backend for Java hands-on execution.

## What it does

- compiles `Main.java` with `javac`
- starts `java Main`
- supports the same API contract as the Next.js route:
  - `action: "start"`
  - `action: "poll"`
  - `action: "input"`
  - `action: "stop"`

## Run locally

You need Java installed on the machine.

```bash
cd java-runner-service
npm start
```

The service starts on `http://localhost:8080` by default.

## Environment variables

```env
PORT=8080
JAVA_TIMEOUT_MS=5000
SESSION_IDLE_MS=600000
JAVA_RUNNER_TOKEN=change-me
```

If `JAVA_RUNNER_TOKEN` is set, requests must include:

```http
Authorization: Bearer your-token
```

## Health check

```http
GET /health
```

## Main endpoint

```http
POST /java-run
Content-Type: application/json
Authorization: Bearer your-token
```

Example body:

```json
{
  "action": "start",
  "code": "public class Main { public static void main(String[] args) { System.out.println(\"Hello\"); } }"
}
```

## Deploy idea

- Railway
- Render
- Fly.io
- VPS with Docker

Use the included `Dockerfile` for container-based deploys.
