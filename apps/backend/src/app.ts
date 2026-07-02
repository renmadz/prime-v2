import Fastify from "fastify";
import fastifyEnv from "@fastify/env";
import fastifyHelmet from "@fastify/helmet";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import fastifyOauth2 from "@fastify/oauth2";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyMultipart from "@fastify/multipart";
import ConnectPgSimple from "connect-pg-simple";
import pg from "pg";
import { envPluginOptions } from "./plugins/env.js";
import healthRoutes from "./routes/health.js";
import authRoutes, { SESSION_COOKIE_NAME } from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import proposalTypesRoutes from "./routes/proposalTypes.js";
import formTemplatesRoutes from "./routes/formTemplates.js";
import proposalsRoutes from "./routes/proposals.js";
import attachmentsRoutes from "./routes/attachments.js";
import submissionRoutes from "./routes/submission.js";
import commentsRoutes from "./routes/comments.js";
import versionsRoutes from "./routes/versions.js";
import workflowRoutes from "./routes/workflow.js";
import { logger, setLogLevel } from "./utils/logger.js";

const SESSION_SLIDING_MAX_AGE_MS = 30 * 60 * 1000;

export async function buildApp() {
  const app = Fastify({ logger });

  // 1. Env validation first — app must crash before any other plugin
  //    registers if a required var is missing or invalid.
  await app.register(fastifyEnv, envPluginOptions);
  setLogLevel(app.config.NODE_ENV === "development" ? "debug" : "info");

  // 2. Security headers before any routes.
  await app.register(fastifyHelmet);

  // 3. CORS scoped to FRONTEND_URL only — never a wildcard.
  await app.register(fastifyCors, {
    origin: app.config.FRONTEND_URL,
    credentials: true,
  });

  // 4. Cookies + server-side session (PostgreSQL-backed via connect-pg-simple —
  //    NOT JWT, so a deactivation can invalidate sessions immediately).
  await app.register(fastifyCookie);

  const sessionPgPool = new pg.Pool({ connectionString: app.config.DATABASE_URL });
  const PgSessionStore = ConnectPgSimple(fastifySession as never);
  await app.register(fastifySession, {
    secret: app.config.SESSION_SECRET,
    cookieName: SESSION_COOKIE_NAME,
    store: new PgSessionStore({
      pool: sessionPgPool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    cookie: {
      httpOnly: true,
      secure: app.config.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: SESSION_SLIDING_MAX_AGE_MS,
    },
    saveUninitialized: false,
  });
  app.addHook("onClose", async () => {
    await sessionPgPool.end();
  });

  // 5. Google OAuth2 client for the Applicant login path only.
  await app.register(fastifyOauth2, {
    name: "oauth2Google",
    scope: ["openid", "email", "profile"],
    credentials: {
      client: {
        id: app.config.GOOGLE_CLIENT_ID,
        secret: app.config.GOOGLE_CLIENT_SECRET,
      },
      auth: fastifyOauth2.GOOGLE_CONFIGURATION,
    },
    callbackUri: app.config.GOOGLE_CALLBACK_URL,
  });

  // 6. Global rate limiting (defense in depth). The staff login endpoint also
  //    enforces its own PostgreSQL-backed per-IP/per-email limits in
  //    services/rateLimit.ts so the state survives a process restart.
  await app.register(fastifyRateLimit, {
    global: false,
  });

  // 6b. Multipart file upload support — fileSize set to Infinity so files always
  //     reach the route handler, which enforces the 50 MB cap and returns 400.
  //     (Without Infinity, @fastify/multipart falls back to Fastify's bodyLimit
  //     default of 1 MB and returns 413 before the handler can check.)
  await app.register(fastifyMultipart, { limits: { fileSize: Infinity } });

  // 7. Routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(proposalTypesRoutes);
  await app.register(formTemplatesRoutes);
  await app.register(proposalsRoutes);
  await app.register(attachmentsRoutes);
  await app.register(submissionRoutes);
  await app.register(commentsRoutes);
  await app.register(versionsRoutes);
  await app.register(workflowRoutes);

  // 8. Error handlers
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    if (error.validation || error.name === "ZodError") {
      return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
    }
    reply.status(500).send({
      error: "Internal Server Error",
      statusCode: 500,
      ...(app.config.NODE_ENV === "development" ? { stack: error.stack } : {}),
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: "Not Found",
      statusCode: 404,
    });
  });

  return app;
}
