import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ kind: z.enum(["backtest", "dataset"]), id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("delete_lab_history", {
      _kind: data.kind,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return { deleted: true };
  });