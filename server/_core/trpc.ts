import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// ─── Error logging middleware ───
// Captures procedure name, user ID, and error details for every failure.
// Structured console.error output — swap for Sentry/Datadog later.

const errorLogger = t.middleware(async ({ path, ctx, next }) => {
  const result = await next();

  if (!result.ok) {
    const userId = ctx.user?.id ?? "anon";
    const error = result.error;

    console.error(
      JSON.stringify({
        level: "error",
        procedure: path,
        userId,
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        // Include cause chain if present
        ...(error.cause ? { cause: String(error.cause) } : {}),
      })
    );
  }

  return result;
});

// All procedures go through the error logger
const loggedProcedure = t.procedure.use(errorLogger);

export const publicProcedure = loggedProcedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = loggedProcedure.use(requireUser);

export const adminProcedure = loggedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
