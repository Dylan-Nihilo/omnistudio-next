import { Router } from "express";
import { getDatabase } from "@/db/database";
import { users } from "@/db/schema";
import { success } from "@/lib/responseFormat";

export default Router().get("/", async (_request, response) => {
  const [user] = await getDatabase().select({ id: users.id }).from(users).limit(1);
  response.set("Cache-Control", "no-store").json(success({ initialized: Boolean(user) }));
});
