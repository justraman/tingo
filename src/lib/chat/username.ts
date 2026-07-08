import { getHostLocalStorage } from "@parity/product-sdk-host";
import { isHostAsync } from "@/lib/host/detect";
import { CHAT_NAME_MAX } from "./protocol";

const USERNAME_KEY = "tambola:chat-username";

async function hostStorage() {
  return (await isHostAsync()) ? await getHostLocalStorage() : null;
}

/** The chat name the user chose, from host localStorage (browser localStorage standalone). */
export async function readStoredUsername(): Promise<string | null> {
  const storage = await hostStorage();
  const value = storage
    ? await storage.readString(USERNAME_KEY)
    : window.localStorage.getItem(USERNAME_KEY) ?? "";
  return value.trim() || null;
}

export async function writeStoredUsername(name: string): Promise<void> {
  const value = name.trim().slice(0, CHAT_NAME_MAX);
  if (!value) return;
  const storage = await hostStorage();
  if (storage) await storage.writeString(USERNAME_KEY, value);
  else window.localStorage.setItem(USERNAME_KEY, value);
}
