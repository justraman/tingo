import { truapi } from "@/lib/truapi";
import { CHAT_NAME_MAX } from "./protocol";

const USERNAME_KEY = "tambola:chat-username";

/** The chat name the user chose — host key-value storage inside a container,
 *  browser localStorage standalone (the runtime picks). */
export async function readStoredUsername(): Promise<string | null> {
  const value = await truapi.host.storage.getString(USERNAME_KEY);
  return value?.trim() || null;
}

export async function writeStoredUsername(name: string): Promise<void> {
  const value = name.trim().slice(0, CHAT_NAME_MAX);
  if (!value) return;
  await truapi.host.storage.setString(USERNAME_KEY, value);
}
