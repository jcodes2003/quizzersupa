## quizzersupa

### Web app

Run the Next.js app:

```bash
npm run dev
```

### Separate Java runner

This project supports a separate Java execution backend for Java hands-on quizzes.

If `JAVA_RUNNER_BASE_URL` is set, [app/api/java-run/route.ts](/c:/Users/APPLE%20BYTES/quizzersupa/app/api/java-run/route.ts) will proxy Java run requests to that external service instead of trying to use `javac` inside the Next.js server.

### Next.js env

```env
JAVA_RUNNER_BASE_URL=http://localhost:8080
JAVA_RUNNER_TOKEN=change-me
```

### Runner service

The standalone backend is in:

```text
java-runner-service/
```

Run it locally:

```bash
cd java-runner-service
npm start
```

That service needs Java installed on the host, or you can deploy it with Docker using:

```text
java-runner-service/Dockerfile
```

More details are in:

```text
java-runner-service/README.md
```
