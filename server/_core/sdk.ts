import { ForbiddenError } from "@shared/_core/errors";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { supabaseAdmin } from "./supabase";

class AuthService {
  /**
   * Authenticate a request by extracting the Supabase access token from the
   * Authorization header, verifying it with Supabase, and returning (or
   * auto-provisioning) the corresponding local user row.
   */
  async authenticateRequest(req: Request): Promise<User> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw ForbiddenError("Missing authorization token");
    }

    const token = authHeader.substring(7);

    let supabaseUser;
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        console.warn("[Auth] Supabase token verification failed:", error?.message ?? "no user returned");
        throw ForbiddenError("Invalid or expired token");
      }
      supabaseUser = data.user;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Invalid or expired")) throw err;
      console.error("[Auth] Supabase getUser network error:", err instanceof Error ? err.message : err);
      throw ForbiddenError("Auth service unavailable");
    }

    // Auto-provision: look up by Supabase UUID (stored in openId), create if
    // this is the user's first authenticated request.
    try {
      const user = await db.ensureUser(
        supabaseUser.id,
        supabaseUser.email ?? "",
        supabaseUser.user_metadata?.name ??
          supabaseUser.email?.split("@")[0] ??
          "User"
      );

      if (!user) {
        console.error("[Auth] ensureUser returned null for:", supabaseUser.id);
        throw ForbiddenError("Failed to provision user");
      }

      return user;
    } catch (err) {
      if (err instanceof Error && err.message.includes("provision")) throw err;
      console.error("[Auth] Database error during user provisioning:", err instanceof Error ? err.message : err);
      throw ForbiddenError("Database unavailable");
    }
  }
}

export const sdk = new AuthService();
