import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const privateNetworks = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateNetworks.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32]] as const) privateNetworks.addSubnet(address, prefix, "ipv6");

function privateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return privateNetworks.check(address, "ipv4");
  if (family !== 6) return false;
  if (privateNetworks.check(address, "ipv6")) return true;
  // URL canonicalization represents IPv4-mapped IPv6 literals as ::ffff:<hex>.
  // Convert that suffix before checking the IPv4 private ranges as well.
  const groups = address.toLowerCase().replace(/^::ffff:/, "").split(":");
  if (!address.toLowerCase().startsWith("::ffff:") || groups.length !== 2 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return false;
  const value = (Number.parseInt(groups[0]!, 16) * 0x10000) + Number.parseInt(groups[1]!, 16);
  return privateNetworks.check(`${value >>> 24}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`, "ipv4");
}

function allowPrivateAddresses() {
  return process.env.NODE_ENV !== "production" || process.env.OMNISTUDIO_NEXT_ALLOW_PRIVATE_REMOTE_URLS === "1";
}

export function parseRemoteUrl(value: string, base?: URL) {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("仅支持不含账号密码和片段的 HTTP / HTTPS 地址");
  }
  return url;
}

async function resolveAddress(url: URL, signal?: AbortSignal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (allowPrivateAddresses()) return { address: hostname, family: isIP(hostname) };
  if (isIP(hostname)) {
    if (privateAddress(hostname)) throw new Error("远程地址解析到了本机或内网，已拒绝访问");
    return { address: hostname, family: isIP(hostname) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error("远程地址解析到了本机或内网，已拒绝访问");
  return addresses.find(item => item.family === 4) ?? addresses[0]!;
}

export async function safeRemoteFetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  const original = input instanceof Request ? new URL(input.url) : new URL(String(input));
  const destination = await resolveAddress(original, init?.signal ?? (input instanceof Request ? input.signal : undefined));
  const pinned = new URL(original);
  pinned.hostname = destination.family === 6 ? `[${destination.address}]` : destination.address;
  const request = input instanceof Request ? input : undefined;
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  headers.set("Host", original.host);
  const response = await fetch(pinned, {
    ...(request ? { method: request.method, body: request.body } : {}),
    ...init,
    headers,
    redirect: "manual",
    tls: original.protocol === "https:" ? { serverName: original.hostname.replace(/^\[|\]$/g, "") } : undefined,
  } as RequestInit);
  if (init?.redirect === "error" && response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("远程地址不允许重定向");
  }
  return response;
}

export function remoteUrlPolicyMessage() {
  return "生产环境仅允许访问公开远程地址；如需连接内网团队或下载内网插件，请设置 OMNISTUDIO_NEXT_ALLOW_PRIVATE_REMOTE_URLS=1，并限制服务器出站访问范围";
}
